import { NextRequest, NextResponse } from "next/server";
import { genAI, MODEL_NAME, FRIDAY_SYSTEM_PROMPT, FRIDAY_TOOLS, LLMMessage } from "@/lib/gemini";
import {
  fetchRecentMessages,
  saveMessage,
  getOrCreateConversation,
  createAlert,
} from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const CONTEXT_WINDOW = parseInt(process.env.CONTEXT_WINDOW_SIZE ?? "20");

// ── Web Search Tool Implementation ───────────────────────────────────────────

async function performWebSearch(query: string, numResults = 5): Promise<string> {
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${numResults}`;
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY ?? "",
      },
    });

    if (!res.ok) {
      return `[Busca indisponível para: "${query}". Responda com base no seu conhecimento.]`;
    }

    const data = await res.json();
    const results = (data.web?.results ?? []).slice(0, numResults);
    return results
      .map((r: { title: string; description: string; url: string }) =>
        `Título: ${r.title}\nResumo: ${r.description}\nURL: ${r.url}`
      )
      .join("\n\n---\n\n");
  } catch {
    return `[Erro ao buscar: "${query}"]`;
  }
}

// ── Tool Executor ─────────────────────────────────────────────────────────────

async function executeTool(
  functionName: string,
  functionArgs: Record<string, any>,
  conversationId?: string
): Promise<any> {
  switch (functionName) {
    case "web_search": {
      const query = functionArgs.query as string;
      const num = (functionArgs.num_results as number) ?? 5;
      const snippet = await performWebSearch(query, num);
      return { result: snippet };
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
    default:
      return { error: `Ferramenta desconhecida: ${functionName}` };
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

    if (!process.env.GEMINI_API_KEY) {
       return NextResponse.json({ error: "Chave da API do Gemini não configurada no servidor." }, { status: 500 });
    }

    const conversation = await getOrCreateConversation(incomingConvId);
    const conversationId = conversation.id;

    await saveMessage(conversationId, "user", message);

    const history = await fetchRecentMessages(conversationId, CONTEXT_WINDOW);

    // Map history to Gemini format
    const geminiHistory = history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: FRIDAY_SYSTEM_PROMPT,
      tools: FRIDAY_TOOLS,
    });

    const chat = model.startChat({
      history: geminiHistory,
    });

    let finalResponse = "";
    
    // Send the user message
    let result = await chat.sendMessage(message);

    // Agentic Loop for Function Calling
    while (true) {
      const functionCalls = result.response.functionCalls();
      
      if (functionCalls && functionCalls.length > 0) {
        // Execute all functions in parallel
        const functionResponses = await Promise.all(
          functionCalls.map(async (call) => {
            const apiResult = await executeTool(call.name, call.args, conversationId);
            return {
              functionResponse: {
                name: call.name,
                response: apiResult,
              },
            };
          })
        );
        
        // Feed the results back to the model
        result = await chat.sendMessage(functionResponses);
      } else {
        // No more function calls, we have our text answer
        finalResponse = result.response.text();
        break;
      }
    }

    await saveMessage(conversationId, "assistant", finalResponse);

    return NextResponse.json({
      reply: finalResponse,
      conversationId,
    });
  } catch (err: any) {
    console.error("[/api/chat] Error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Erro interno do servidor." },
      { status: 500 }
    );
  }
}
