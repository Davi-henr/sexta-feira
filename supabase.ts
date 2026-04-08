import { createClient } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";

export interface DBMessage {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  tokens?: number;
  created_at: string;
}

export interface DBConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export type AlertStatus = "active" | "triggered" | "dismissed" | "error";

export interface DBAlert {
  id: string;
  conversation_id?: string;
  type: string;
  label: string;
  condition_json: Record<string, unknown>;
  status: AlertStatus;
  triggered_at?: string;
  trigger_data?: Record<string, unknown>;
  created_at: string;
}

// ── Browser client (uses anon key — safe for client components) ───────────────

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Server-side admin client (uses service role key — only in API routes) ────

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── Message helpers ───────────────────────────────────────────────────────────

/**
 * Fetch the N most recent messages for a conversation (returned in ASC order
 * so they can be fed directly into the LLM messages array).
 */
export async function fetchRecentMessages(
  conversationId: string,
  limit = 20
): Promise<DBMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  // Return in chronological order (oldest first) for the LLM
  return (data as DBMessage[]).reverse();
}

export async function saveMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  tokens?: number
): Promise<DBMessage> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role, content, tokens })
    .select()
    .single();

  if (error) throw error;
  return data as DBMessage;
}

// ── Conversation helpers ─────────────────────────────────────────────────────

export async function getOrCreateConversation(id?: string): Promise<DBConversation> {
  if (id) {
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", id)
      .single();
    if (data) return data as DBConversation;
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({ title: "Nova Conversa" })
    .select()
    .single();

  if (error) throw error;
  return data as DBConversation;
}

// ── Alert helpers ─────────────────────────────────────────────────────────────

export async function createAlert(
  label: string,
  type: string,
  conditionJson: Record<string, unknown>,
  conversationId?: string
): Promise<DBAlert> {
  const { data, error } = await supabase
    .from("alerts")
    .insert({ label, type, condition_json: conditionJson, conversation_id: conversationId })
    .select()
    .single();

  if (error) throw error;
  return data as DBAlert;
}

export async function fetchTriggeredAlerts(): Promise<DBAlert[]> {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("status", "triggered")
    .order("triggered_at", { ascending: false });

  if (error) throw error;
  return data as DBAlert[];
}

export async function dismissAlert(alertId: string): Promise<void> {
  const { error } = await supabase
    .from("alerts")
    .update({ status: "dismissed" })
    .eq("id", alertId);
  if (error) throw error;
}
