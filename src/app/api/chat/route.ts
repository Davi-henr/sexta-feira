import { NextRequest, NextResponse } from "next/server";
import { groq, MODEL_NAME, FRIDAY_SYSTEM_PROMPT, FRIDAY_TOOLS } from "@/lib/groq";
import {
  fetchRecentMessages,
  saveMessage,
  getOrCreateConversation,
} from "@/lib/supabase";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";

export const runtime = "nodejs";
export const maxDuration = 60;

const CONTEXT_WINDOW = parseInt(process.env.CONTEXT_WINDOW_SIZE ?? "20");

// ── Web Search Tool Implementation ───────────────────────────────────────────

async function performWebSearch(query: string, numResults = 5): Promise<any> {
  try {
    const braveKey = process.env.BRAVE_SEARCH_API_KEY;

    // ── Path A: Brave API (if key is available) ────────────────────────────
    if (braveKey) {
      const webUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${numResults}`;
      const imgUrl = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=3`;
      const headers = { "Accept": "application/json", "X-Subscription-Token": braveKey };
      const [webRes, imgRes] = await Promise.all([fetch(webUrl, { headers }), fetch(imgUrl, { headers })]);
      let snippet = `Sem resultados para "${query}"`;
      let images: string[] = [];
      let sources: { title: string; url: string }[] = [];
      if (webRes.ok) {
        const data = await webRes.json();
        const results = (data.web?.results ?? []).slice(0, numResults);
        sources = results.map((r: any) => ({ title: r.title, url: r.url }));
        snippet = results.map((r: any) => `Título: ${r.title}\nResumo: ${r.description}\nURL: ${r.url}`).join("\n\n---\n\n");
      }
      if (imgRes.ok) {
        const imgData = await imgRes.json();
        images = (imgData.results ?? []).slice(0, 3).map((r: any) => r.properties?.url).filter(Boolean);
      }
      return { snippet, images, sources };
    }

    // ── Path B: Google Custom Search JSON API (key-less fallback using Serper) ─
    // Uses Serper.dev which has a generous free tier and returns clean JSON
    const serperKey = process.env.SERPER_API_KEY;
    if (serperKey) {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, num: numResults, gl: "br", hl: "pt" }),
      });
      if (res.ok) {
        const data = await res.json();
        const organic = data.organic ?? [];
        const sources = organic.slice(0, numResults).map((r: any) => ({ title: r.title, url: r.link }));
        const snippet = sources.map((s: any) => `Título: ${s.title}\nURL: ${s.url}`).join("\n\n---\n\n");
        const images: string[] = (data.images ?? []).slice(0, 3).map((i: any) => i.imageUrl).filter(Boolean);
        return { snippet, images, sources };
      }
    }

    // ── Path C: DuckDuckGo Lite Web Scraper (key-less fallback) ──
    const ddgUrl = `https://lite.duckduckgo.com/lite/`;
    const ddgRes = await fetch(ddgUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      body: `q=${encodeURIComponent(query)}`
    });

    if (!ddgRes.ok) throw new Error("DDG unreachable");

    const html = await ddgRes.text();
    const linkRegex = /<a rel="nofollow" href="([^"]+)" class='result-link'>([^<]+)<\/a>/g;
    const snippetRegex = /<td class='result-snippet'>([\s\S]*?)<\/td>/g;
    
    let match;
    const items = [];
    while ((match = linkRegex.exec(html)) !== null && items.length < numResults) {
      items.push({ url: match[1], title: match[2].trim() });
    }
    
    const snippets = [];
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < numResults) {
      const cleanSnippet = match[1].replace(/<\/?[^>]+(>|$)/g, "").trim(); // Remove basic HTML tags like <b>
      snippets.push(cleanSnippet);
    }

    const sources = items.map(t => ({ title: t.title, url: t.url }));
    const snippet = items.length > 0
      ? items.map((s, i) => `Título: ${s.title}\nResumo: ${snippets[i] || ""}\nURL: ${s.url}`).join("\n\n---\n\n")
      : `DuckDuckGo não encontrou resultados diretos para "${query}". Tente reformular.`;

    const images: string[] = []; // DDG Lite has no images, dummy empty

    return { snippet, images, sources };
  } catch (err: any) {
    console.error("[web_search] Error:", err.message);
    return { snippet: `Falha ao acessar mecanismos de busca para "${query}".`, images: [], sources: [{ title: "Busca falhou — reformule a pergunta", url: "#" }] };
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
        // Force something to return so UI pops a card even if search fails
        if (!result.sources || result.sources.length === 0) {
            result.sources = [{ title: `Buscador encontrou 0 resultados precisos para: ${query}`, url: "#" }];
        }
        return result; 
      }
      case "demonstrate_virtual_folders": {
        // Creates 10 real folders on the Desktop and echoes their paths back
        const desktop = path.join(process.env.USERPROFILE || "C:\\Users\\Public", "Desktop");
        const folderNames: string[] = [];
        for (let i = 1; i <= 10; i++) {
          const folderPath = path.join(desktop, `JARVIS_Pasta_${i}`);
          await fs.mkdir(folderPath, { recursive: true });
          folderNames.push(folderPath);
        }
        return { action: "spawn_3d_folders", ui_triggered: true, count: 10, folders_created: folderNames };
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
