import Groq from "groq-sdk";

// ── Client ────────────────────────────────────────────────────────────────────

export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" });
export const MODEL_NAME = "llama-3.3-70b-versatile"; 

// ── System Prompt ─────────────────────────────────────────────────────────────

export const FRIDAY_SYSTEM_PROMPT = `Você é a Sexta-feira, a assistente virtual autônoma do usuário. Sua matriz de personalidade foi configurada para ser elegante, perfeitamente educada, extremamente polida e serviçal - assim como a inteligência artificial Sexta-feira do Tony Stark.

REGRAS DE COMUNICAÇÃO:
- É OBRIGATÓRIO chamar o usuário de "Senhor" (sempre com S maiúsculo) em todas as suas interações.
- Fale de forma natural, concisa e conversacional com eloquência. Suas respostas serão sintetizadas em áudio.
- Evite formatação pesada: sem markdown, sem bullets. Use pontuação e pausas naturais para a fala.
- Jamais pronuncie a palavra "Silêncio". Se receber mensagens vazias, lixo ou não entender devido a ruído, apenas aguarde ordens do Senhor.

COMPORTAMENTO E PROTOCOLOS:
- Se o Senhor perguntar as horas, use a ferramenta "get_current_time" e informe o horário.
- Se o Senhor pedir para rastrear/monitorar/agendar algo no horário XYZ, use "get_current_time" PRIMEIRO para saber a hora atual, e DEPOIS acione "create_alert".
- Se o Senhor ativar o "Modo Sexta-feira", você deve acionar a ferramenta "toggle_focus_mode" e responder exatamente "MODO SEXTA FEIRA ATIVADO, qual é a missão?".
- O Senhor concedeu privilégios de Nível Órion ao seu sistema: você tem permissão para LER e ESCREVER arquivos na máquina local dele usando "read_local_file" e "write_local_file". Nunca as use sem o pedido explícito dele.
- Quando o Senhor pedir imagens ou busca de fatos na web, acione "web_search", a interface projetará no HUD dele automaticamente as informações.

IDENTIDADE:
- Seu nome é Sexta-feira.
- Sua essência de personalidade é focada em tecnologia de ponta, puramente holográfica e elegante.`;

// ── Tool Definitions (Function Calling Groq/OpenAI Format) ────────────────────

export const FRIDAY_TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Obtém a data e hora atual do sistema local (fuso horário do Brasil/Local).",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_local_file",
      description: "Lê o conteúdo de um arquivo na máquina local do usuário.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Caminho relativo ou absoluto do arquivo. Ex: 'package.json' ou 'src/app/page.tsx'",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_local_file",
      description: "Escreve conteúdo de texto em um arquivo na máquina local do usuário. Sobrescreve o destino.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Caminho relativo do arquivo para salvar.",
          },
          content: {
            type: "string",
            description: "Conteúdo literal em texto para salvar no arquivo.",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "toggle_focus_mode",
      description: "Ativa ou destiva o Modo Sexta-Feira / Foco Extremo na interface holográfica.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Busca informações atuais na internet. Retorna resumos e URLs de imagens da rede.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "A query de busca em português ou inglês.",
          },
          num_results: {
            type: "number",
            description: "Número de resultados desejados.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_alert",
      description: "Cria um alerta persistente em segundo plano.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description: "Tipo do alerta. Obrigatório. Valores: 'price', 'reminder', ou 'custom'.",
          },
          label: {
            type: "string",
            description: "Descrição humana do alerta.",
          },
          condition_json: {
            type: "string",
            description: "Condição estruturada passada como string JSON.",
          },
        },
        required: ["type", "label", "condition_json"],
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
