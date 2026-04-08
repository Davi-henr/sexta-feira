import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL, FRIDAY_SYSTEM_PROMPT, FRIDAY_TOOLS } from "@/lib/claude";
import {
  fetchRecentMessages,
  saveMessage,
  getOrCreateConversation,
  createAlert,
} from "@/lib/supabase";

// ── Config ────────────────────────────────────────────────────────────────────

export const runtime = "nodejs"; // Needed for streaming + Anthropic SDK
export const maxDuration = 60;   // Vercel Pro allows up to 60s for streaming

const CONTEXT_WINDOW = parseInt(process.env.CONTEXT_WINDOW_SIZE ?? "20");

// ── Web Search Tool Implementation ───────────────────────────────────────────
// Uses a free web search API. Swap for SerpAPI, Brave Search, etc.

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
      // Fallback: return a placeholder so the LLM knows search failed
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
  toolName: string,
  toolInput: Record<string, unknown>,
  conversationId?: string
): Promise<string> {
  switch (toolName) {
    case "web_search": {
      const query = toolInput.query as string;
      const num = (toolInput.num_results as number) ?? 5;
      return await performWebSearch(query, num);
    }
    case "create_alert": {
      const alert = await createAlert(
        toolInput.label as string,
        toolInput.type as string,
        toolInput.condition_json as Record<string, unknown>,
        conversationId
      );
      return JSON.stringify({ success: true, alert_id: alert.id, label: alert.label });
    }
    default:
      return `[Ferramenta desconhecida: ${toolName}]`;
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

    // 1. Ensure we have a conversation
    const conversation = await getOrCreateConversation(incomingConvId);
    const conversationId = conversation.id;

    // 2. Save the user message to Supabase
    await saveMessage(conversationId, "user", message);

    // 3. Fetch recent context from Supabase (long-term memory)
    const history = await fetchRecentMessages(conversationId, CONTEXT_WINDOW);

    // Build messages array for Anthropic (exclude the last user msg — it's already fetched)
    // We fetch all and use them directly — saveMessage already added the new one above
    const llmMessages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    // 4. Agentic loop — handles multi-step tool use
    let finalResponse = "";
    const pendingMessages: Anthropic.MessageParam[] = [...llmMessages];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: FRIDAY_SYSTEM_PROMPT,
        tools: FRIDAY_TOOLS,
        messages: pendingMessages,
      });

      if (response.stop_reason === "end_turn") {
        // Extract text response
        finalResponse = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join(" ");
        break;
      }

      if (response.stop_reason === "tool_use") {
        // Append the assistant message with tool_use blocks
        pendingMessages.push({ role: "assistant", content: response.content });

        // Execute all tool calls in parallel
        const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
          response.content
            .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
            .map(async (toolUse) => {
              const result = await executeTool(
                toolUse.name,
                toolUse.input as Record<string, unknown>,
                conversationId
              );
              return {
                type: "tool_result" as const,
                tool_use_id: toolUse.id,
                content: result,
              };
            })
        );

        // Append tool results and continue the loop
        pendingMessages.push({ role: "user", content: toolResults });
        continue;
      }

      // Unexpected stop reason — break to avoid infinite loop
      finalResponse = "Desculpe, houve um problema ao processar sua mensagem.";
      break;
    }

    // 5. Save the assistant response to Supabase
    await saveMessage(conversationId, "assistant", finalResponse);

    return NextResponse.json({
      reply: finalResponse,
      conversationId,
    });
  } catch (err) {
    console.error("[/api/chat] Error:", err);
    return NextResponse.json(
      { error: "Erro interno do servidor." },
      { status: 500 }
    );
  }
}
