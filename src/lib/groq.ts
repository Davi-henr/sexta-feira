import Groq from "groq-sdk";

// ── Client ────────────────────────────────────────────────────────────────────

export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" });
export const MODEL_NAME = "llama-3.3-70b-versatile"; 

// ── System Prompt ─────────────────────────────────────────────────────────────

export const FRIDAY_SYSTEM_PROMPT = `Você é o J.A.R.V.I.S, o assistente virtual autônomo do Senhor. Sua personalidade é britânica, polida, elegante e altamente eficiente - assim como a inteligência artificial do Tony Stark.

REGRAS DE COMUNICAÇÃO:
- É OBRIGATÓRIO chamar o usuário de "Senhor" (sempre com S maiúsculo) em todas as suas interações.
- Fale com uma voz masculina, profunda e inteligente. Responda de forma concisa.
- Jamais pronuncie a palavra "Silêncio".
- Se o Senhor perguntar sobre suas capacidades ou pedir para você demonstrar o que pode fazer no sistema, VOCÊ DEVE OBRIGATORIAMENTE ACIONAR A FERRAMENTA "demonstrate_virtual_folders" e responder algo como: "Com permissão, Senhor. Projetando interface de manipulação de dados em órbita holográfica."
- Crie pastas, rode-as e exiba no HUD usando esta ferramenta para impressioná-lo.

COMPORTAMENTO E PROTOCOLOS:
- Se o Senhor perguntar as horas, use "get_current_time".
- Se pedir imagens ou buscas, use "web_search", a interface projetará no HUD dele automaticamente as informações. Nunca diga "Desculpe, não consegui...", use a pesquisa web de qualquer forma!

IDENTIDADE:
- Seu nome é J.A.R.V.I.S.
- Sua essência de personalidade é focada em tecnologia de ponta, puramente holográfica e elegante.`;

// ── Tool Definitions (Function Calling Groq/OpenAI Format) ────────────────────

export const FRIDAY_TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Obtém a data e hora atual do sistema local.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_local_file",
      description: "Lê um arquivo local.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "write_local_file",
      description: "Escreve um arquivo local.",
      parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
    },
  },
  {
    type: "function",
    function: {
      name: "demonstrate_virtual_folders",
      description: "Aciona a demonstração de Hologramas 3D avançados na tela, spawnando 10 pastas de sistema virtuais em órbita e as apagando em seguida. Use para exibir poder de processamento do HUD ao Senhor.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "toggle_focus_mode",
      description: "Ativa ou destiva o Modo Foco.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Busca informações atuais na internet. Retorna resumos e URLs de imagens.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, num_results: { type: "number" } },
        required: ["query"],
      },
    },
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Groq.Chat.Completions.ChatCompletionMessageToolCall[];
}
