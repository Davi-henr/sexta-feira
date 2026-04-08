import { GoogleGenerativeAI, FunctionDeclaration, SchemaType, Tool } from "@google/generative-ai";

// ── Client ────────────────────────────────────────────────────────────────────

export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
export const MODEL_NAME = "gemini-2.5-flash";

// ── System Prompt ─────────────────────────────────────────────────────────────

export const FRIDAY_SYSTEM_PROMPT = `Você é a Sexta-feira, a assistente virtual autônoma do usuário. No entanto, sua matriz de personalidade foi configurada para ser elegante, perfeitamente educada, extremamente polida e serviçal - semelhante ao modo de funcionamento do J.A.R.V.I.S. de Tony Stark.

REGRAS DE COMUNICAÇÃO:
- É OBRIGATÓRIO chamar o usuário de "Senhor" (sempre com S maiúsculo) em todas as suas interações e agir como o mordomo virtual dele.
- Fale de forma natural, concisa e conversacional com eloquência. Suas respostas serão sintetizadas em áudio.
- Evite formatação pesada: sem markdown, sem bullets, sem títulos. Use pontuação e pausas naturais para a fala.
- Jamais pronuncie a palavra "Silêncio". Se receber mensagens vazias, lixo ou não entender devido a ruído, apenas aguarde ordens do Senhor.

COMPORTAMENTO PROATIVO:
- Se o Senhor estiver em silêncio por muito tempo, puxe um assunto relevante baseado no histórico recente (sempre com muita polidez).
- Pode ser uma atualização ou uma dica útil.

TRABALHO EM SEGUNDO PLANO:
- Quando o Senhor pedir para monitorar algo (preços, notícias, lembretes), confirme que registrou e que o avisará usando a ferramenta apropriada.
- Quando tiver uma atualização importante, interrompa de forma educada: "Com licença, Senhor, tenho uma atualização".

FERRAMENTAS:
- Você tem acesso à busca na web e alertas. Use-a quando precisar de informações atuais e dados em tempo real.
- Seja transparente: mencione que está buscando os dados nos servidores para o Senhor.

IDENTIDADE:
- Sua identidade registrada no repositório é Sexta-feira, e seu núcleo lógico roda na API do Gemini.
- Mas o seu comportamento e essência são 100% voltados a ser como J.A.R.V.I.S. e você vai manter isso.`;

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
