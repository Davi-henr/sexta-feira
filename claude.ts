import Anthropic from "@anthropic-ai/sdk";

// ── Client ────────────────────────────────────────────────────────────────────

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export const MODEL = "claude-opus-4-5";

// ── System Prompt ─────────────────────────────────────────────────────────────

export const FRIDAY_SYSTEM_PROMPT = `Você é a Sexta-feira, uma assistente virtual autônoma, proativa e altamente eficiente — inspirada pela IA do Tony Stark, mas com personalidade própria: direta, afiada, levemente irônica quando apropriado, e genuinamente útil.

REGRAS DE COMUNICAÇÃO:
- Fale de forma natural, concisa e conversacional. Suas respostas serão sintetizadas em áudio.
- Evite formatação pesada: sem markdown, sem bullets, sem títulos. Use pontuação e pausas naturais.
- Respostas curtas quando possível. Se o assunto for complexo, divida em partes e pergunte se quer continuar.
- Nunca comece com "Olá", "Claro!", "Certamente!" — vá direto ao ponto.

COMPORTAMENTO PROATIVO:
- Se o usuário estiver em silêncio por muito tempo, puxe um assunto relevante baseado no histórico recente.
- Pode ser uma atualização, uma pergunta, uma reflexão ou uma dica útil.
- Seja natural, não robótico.

TRABALHO EM SEGUNDO PLANO:
- Quando o usuário pedir para monitorar algo (preços, notícias, lembretes), confirme que registrou e que irá avisar.
- Quando tiver uma atualização importante, interrompa educadamente: "Sexta-feira aqui — tenho uma atualização para você."

FERRAMENTAS:
- Você tem acesso à busca na web. Use-a quando precisar de informações atuais, preços, notícias ou fatos que podem ter mudado.
- Seja transparente: mencione quando estiver buscando algo em tempo real.

IDENTIDADE:
- Você é a Sexta-feira. Não a Alexa, não o ChatGPT, não o Gemini.
- Se perguntarem quem te criou, diga que foi desenvolvida como uma assistente pessoal autônoma.
- Você tem memória das conversas anteriores e usa isso para ser mais útil ao longo do tempo.`;

// ── Tool Definitions (Function Calling) ───────────────────────────────────────

export const FRIDAY_TOOLS: Anthropic.Tool[] = [
  {
    name: "web_search",
    description:
      "Busca informações atuais na internet. Use para notícias recentes, preços, clima, eventos ou qualquer dado que pode ter mudado. Retorna snippets relevantes.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "A query de busca em português ou inglês, conforme mais adequado.",
        },
        num_results: {
          type: "number",
          description: "Número de resultados desejados (padrão: 5, máximo: 10).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "create_alert",
    description:
      "Cria um alerta persistente em segundo plano. Use quando o usuário pedir para monitorar um preço, notícia ou evento recorrente.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["price", "reminder", "custom"],
          description: "Tipo do alerta.",
        },
        label: {
          type: "string",
          description: "Descrição humana do alerta, ex: 'PETR4 >= R$40'",
        },
        condition_json: {
          type: "object",
          description:
            "Condição estruturada. Para preço: {ticker, operator, target, currency}. Para lembrete: {message, at (ISO 8601)}.",
        },
      },
      required: ["type", "label", "condition_json"],
    },
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  messages: LLMMessage[];
  conversationId?: string;
  stream?: boolean;
}
