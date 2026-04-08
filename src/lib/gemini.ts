import { GoogleGenerativeAI, FunctionDeclaration, SchemaType, Tool } from "@google/generative-ai";

// ── Client ────────────────────────────────────────────────────────────────────

export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
export const MODEL_NAME = "gemini-2.5-flash";

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
- Seu núcleo lógico roda na API do Gemini.
- Sua essência de personalidade é focada em tecnologia de ponta, puramente holográfica e elegante.`;

// ── Tool Definitions (Function Calling) ───────────────────────────────────────

const getCurrentTimeDeclaration: FunctionDeclaration = {
  name: "get_current_time",
  description: "Obtém a data e hora atual do sistema local (fuso horário do Brasil/Local).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {}, 
  },
};

const readLocalFileDeclaration: FunctionDeclaration = {
  name: "read_local_file",
  description: "Lê o conteúdo de um arquivo na máquina local do usuário.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      path: {
        type: SchemaType.STRING,
        description: "Caminho relativo ou absoluto do arquivo. Ex: 'package.json' ou 'src/app/page.tsx'",
      },
    },
    required: ["path"],
  },
};

const writeLocalFileDeclaration: FunctionDeclaration = {
  name: "write_local_file",
  description: "Escreve conteúdo de texto em um arquivo na máquina local do usuário. Sobrescreve o destino.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      path: {
        type: SchemaType.STRING,
        description: "Caminho relativo do arquivo para salvar.",
      },
      content: {
        type: SchemaType.STRING,
        description: "Conteúdo literal em texto para salvar no arquivo.",
      },
    },
    required: ["path", "content"],
  },
};

const toggleFocusModeDeclaration: FunctionDeclaration = {
  name: "toggle_focus_mode",
  description: "Ativa ou destiva o Modo Sexta-Feira / Foco Extremo na interface holográfica.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {}, 
  },
};

const webSearchDeclaration: FunctionDeclaration = {
  name: "web_search",
  description:
    "Busca informações atuais na internet. Retorna resumos e URLs de imagens da rede.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: {
        type: SchemaType.STRING,
        description: "A query de busca em português ou inglês.",
      },
      num_results: {
        type: SchemaType.NUMBER,
        description: "Número de resultados desejados.",
      },
    },
    required: ["query"],
  },
};

const createAlertDeclaration: FunctionDeclaration = {
  name: "create_alert",
  description:
    "Cria um alerta persistente em segundo plano.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      type: {
        type: SchemaType.STRING,
        description: "Tipo do alerta. Obrigatório. Valores: 'price', 'reminder', ou 'custom'.",
      },
      label: {
        type: SchemaType.STRING,
        description: "Descrição humana do alerta.",
      },
      condition_json: {
        type: SchemaType.STRING,
        description: "Condição estruturada passada como string JSON.",
      },
    },
    required: ["type", "label", "condition_json"],
  },
};

export const FRIDAY_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      webSearchDeclaration, 
      createAlertDeclaration,
      getCurrentTimeDeclaration,
      readLocalFileDeclaration,
      writeLocalFileDeclaration,
      toggleFocusModeDeclaration
    ],
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: "user" | "model";
  content: string;
}
