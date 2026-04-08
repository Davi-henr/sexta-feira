import { GoogleGenerativeAI, FunctionDeclaration, SchemaType, Tool } from "@google/generative-ai";

// ── Client ────────────────────────────────────────────────────────────────────

export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
export const MODEL_NAME = "gemini-2.5-flash";

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
- Quando o usuário pedir para monitorar algo (preços, notícias, lembretes), confirme que registrou e que irá avisar usando a ferramenta apropriada.
- Quando tiver uma atualização importante, interrompa educadamente: "Sexta-feira aqui — tenho uma atualização para você."

FERRAMENTAS:
- Você tem acesso à busca na web e alertas. Use-a quando precisar de informações atuais, preços, notícias ou fatos que podem ter mudado.
- Seja transparente: mencione quando estiver buscando algo em tempo real.

IDENTIDADE:
- Você é a Sexta-feira.
- Se perguntarem quem te criou, diga que foi desenvolvida como uma assistente pessoal autônoma usando o modelo Gemini do Google.
- Você tem memória das conversas anteriores e usa isso para ser mais útil ao longo do tempo.`;

// ── Tool Definitions (Function Calling) ───────────────────────────────────────

const webSearchDeclaration: FunctionDeclaration = {
  name: "web_search",
  description:
    "Busca informações atuais na internet. Use para notícias recentes, preços, clima, eventos ou qualquer dado que pode ter mudado. Retorna snippets relevantes.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: {
        type: SchemaType.STRING,
        description: "A query de busca em português ou inglês, conforme mais adequado.",
      },
      num_results: {
        type: SchemaType.NUMBER,
        description: "Número de resultados desejados (padrão: 5, máximo: 10).",
      },
    },
    required: ["query"],
  },
};

const createAlertDeclaration: FunctionDeclaration = {
  name: "create_alert",
  description:
    "Cria um alerta persistente em segundo plano. Use quando o usuário pedir para monitorar um preço, notícia ou evento recorrente.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      type: {
        type: SchemaType.STRING,
        description: "Tipo do alerta. Obrigatório. Valores: 'price', 'reminder', ou 'custom'.",
      },
      label: {
        type: SchemaType.STRING,
        description: "Descrição humana do alerta, ex: 'PETR4 >= R$40'",
      },
      condition_json: {
        type: SchemaType.STRING,
        description:
          "Condição estruturada passada como string JSON. Exemplo: Para preço: '{\"ticker\": \"PETR4\", \"operator\": \">=\", \"target\": 40, \"currency\": \"BRL\"}'.",
      },
    },
    required: ["type", "label", "condition_json"],
  },
};

export const FRIDAY_TOOLS: Tool[] = [
  {
    functionDeclarations: [webSearchDeclaration, createAlertDeclaration],
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: "user" | "model";
  content: string;
}
