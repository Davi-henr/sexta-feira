import { NextRequest, NextResponse } from "next/server";
import { groq, MODEL_NAME, FRIDAY_SYSTEM_PROMPT, FRIDAY_TOOLS, LLMMessage } from "@/lib/groq";
import {
  fetchRecentMessages,
  saveMessage,
  getOrCreateConversation,
  createAlert,
} from "@/lib/supabase";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

const CONTEXT_WINDOW = parseInt(process.env.CONTEXT_WINDOW_SIZE ?? "20");

// ── Web Search Tool Implementation ───────────────────────────────────────────

async function performWebSearch(query: string, numResults = 5): Promise<any> {
  try {
    const webUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${numResults}`;
    const imgUrl = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=3`;
    
    const headers = {
      "Accept": "application/json",
      "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY ?? "",
    };

    const [webRes, imgRes] = await Promise.all([
      fetch(webUrl, { headers }),
      fetch(imgUrl, { headers })
    ]);

    let snippet = `[Busca web indisponível para "${query}"]`;
    let images: string[] = [];

    if (webRes.ok) {
        const data = await webRes.json();
        const results = (data.web?.results ?? []).slice(0, numResults);
        snippet = results
          .map((r: { title: string; description: string; url: string }) =>
            `Título: ${r.title}\nResumo: ${r.description}\nURL: ${r.url}`
          )
          .join("\n\n---\n\n");
    }
    
    if (imgRes.ok) {
        const imgData = await imgRes.json();
        images = (imgData.results ?? []).slice(0, 3).map((r: any) => r.properties.url);
    }

    return { snippet, images };
  } catch {
    return { snippet: `[Erro ao buscar: "${query}"]`, images: [] };
  }
}

// ── Tool Executor ─────────────────────────────────────────────────────────────

async function executeTool(
  functionName: string,
  functionArgs: Record<string, any>,
  conversationId?: string
): Promise<any> {
  try {
    switch (functionName) {
      case "web_search": {
        const query = functionArgs.query as string;
        const num = (functionArgs.num_results as number) ?? 5;
        const result = await performWebSearch(query, num);
        return result; 
      }
      case "create_alert": {
        let parsedCondition = {};
        try {
          parsedCondition = typeof functionArgs.condition_json === 'string' 
            ? JSON.parse(functionArgs.condition_json) 
            : functionArgs.condition_json;
        } catch (e) {
          parsedCondition = { raw: functionArgs.condition_json };
        }

        const alert = await createAlert(
          functionArgs.label as string,
          functionArgs.type as string,
          parsedCondition,
          conversationId
        );
        return { success: true, alert_id: alert.id, label: alert.label };
      }
      case "get_current_time": {
        const now = new Date();
        return {
          current_time: now.toLocaleTimeString("pt-BR"),
          current_date: now.toLocaleDateString("pt-BR"),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      }
      case "read_local_file": {
        const safePath = path.resolve(process.cwd(), functionArgs.path);
        // Proteção para não sair do diretório do app
        if (!safePath.startsWith(process.cwd())) return { error: "Acesso negado fora do diretório master" };
        const content = await fs.readFile(safePath, "utf-8");
        return { content: content.slice(0, 3000) + (content.length > 3000 ? "...(truncado)" : "") };
      }
      case "write_local_file": {
        const safePath = path.resolve(process.cwd(), functionArgs.path);
        if (!safePath.startsWith(process.cwd())) return { error: "Acesso negado fora do diretório master" };
        await fs.writeFile(safePath, functionArgs.content as string, "utf-8");
        return { success: true, message: "Arquivo escrito com sucesso.", path: safePath };
      }
      case "toggle_focus_mode": {
        return { action: "focus_mode_toggled", ui_triggered: true };
      }
      default:
        return { error: `Ferramenta desconhecida: ${functionName}` };
    }
  } catch (err: any) {
    return { error: `Falha na execução: ${err.message}` };
  }
}


// ── POST Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, conversationId: incomingConvId } = body as {
      message: string;
      conversationId?: string;
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
    }

    if (!process.env.GROQ_API_KEY) {
       return NextResponse.json({ error: "Chave da API da Groq não configurada no servidor." }, { status: 500 });
    }

    const conversation = await getOrCreateConversation(incomingConvId);
    const conversationId = conversation.id;

    await saveMessage(conversationId, "user", message);

    const history = await fetchRecentMessages(conversationId, CONTEXT_WINDOW);

    // Map history to Groq format
    const groqHistory: any[] = [
      { role: "system", content: FRIDAY_SYSTEM_PROMPT },
      ...history.map((m) => ({
        role: m.role, // 'user' or 'assistant'
        content: m.content,
      }))
    ];
    
    groqHistory.push({ role: "user", content: message });

    let finalResponse = "";
    let ui_actions: any[] = [];
    
    // Agentic Loop for Function Calling
    while (true) {
      const response = await groq.chat.completions.create({
        model: MODEL_NAME,
        messages: groqHistory,
        tools: FRIDAY_TOOLS,
        tool_choice: "auto",
        max_completion_tokens: 1024,
      });

      const responseMessage = response.choices[0]?.message;
      const toolCalls = responseMessage?.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        // Push the assistant's message containing tool_calls
        groqHistory.push(responseMessage);
        
        // Execute all functions in parallel
        await Promise.all(
          toolCalls.map(async (toolCall) => {
            let parsedArgs = {};
            try {
               parsedArgs = JSON.parse(toolCall.function.arguments);
            } catch (e) {
               console.warn("Failed to parse tool args", toolCall.function.arguments);
            }

            const apiResult = await executeTool(toolCall.function.name, parsedArgs, conversationId);
            
            // Push actionable data to UI
            ui_actions.push({ name: toolCall.function.name, data: apiResult });

            // Push result back to history
            groqHistory.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: toolCall.function.name,
              content: JSON.stringify(apiResult),
            });
          })
        );
      } else {
        // No more function calls, we have our text answer
        finalResponse = responseMessage?.content || "Erro no processamento da Matriz Groq.";
        break;
      }
    }

    await saveMessage(conversationId, "assistant", finalResponse);

    return NextResponse.json({
      reply: finalResponse,
      conversationId,
      ui_actions
    });
  } catch (err: any) {
    console.error("[/api/chat] Error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Erro interno do servidor." },
      { status: 500 }
    );
  }
}
