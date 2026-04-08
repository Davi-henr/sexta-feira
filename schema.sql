-- ============================================================
-- SEXTA-FEIRA — Supabase Schema
-- Run this in your Supabase SQL Editor to set up the database.
-- ============================================================

-- Enable the pg_cron extension (if you use Supabase's built-in cron)
-- Note: Vercel Cron Jobs are used instead, but keeping this for reference.

-- -----------------------------------------------------------
-- 1. CONVERSATIONS
--    Stores named conversation sessions. Each browser session
--    maps to one conversation by default.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL DEFAULT 'Nova Conversa',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------
-- 2. MESSAGES
--    The long-term memory of Sexta-feira. Every message — user
--    and assistant — is stored here with its conversation_id.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  tokens          INTEGER,               -- optional: track token usage
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON public.messages(conversation_id, created_at DESC);

-- -----------------------------------------------------------
-- 3. ALERTS
--    Persistent background tasks. The Vercel Cron Job writes
--    here when a condition is met; the frontend polls/listens
--    for new rows with status = 'triggered'.
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  type            TEXT NOT NULL DEFAULT 'price',  -- 'price' | 'custom' | 'reminder'
  label           TEXT NOT NULL,                  -- Human-readable: "PETR4 >= R$40"
  condition_json  JSONB NOT NULL,                 -- Machine-readable condition
  -- condition_json examples:
  -- price alert: { "ticker": "PETR4", "operator": ">=", "target": 40, "currency": "BRL" }
  -- reminder:    { "message": "Check email", "at": "2025-07-01T09:00:00Z" }
  status          TEXT NOT NULL DEFAULT 'active'  -- 'active' | 'triggered' | 'dismissed' | 'error'
    CHECK (status IN ('active', 'triggered', 'dismissed', 'error')),
  triggered_at    TIMESTAMPTZ,
  trigger_data    JSONB,   -- The actual value that triggered it (e.g., current price)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alerts_status_idx ON public.alerts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS alerts_triggered_idx ON public.alerts(status, triggered_at DESC) WHERE status = 'triggered';

-- -----------------------------------------------------------
-- 4. ENABLE REALTIME
--    Allows the frontend to subscribe to new/changed rows
--    in the alerts table using Supabase Realtime.
-- -----------------------------------------------------------
ALTER TABLE public.alerts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- -----------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS)
--    For a single-user personal assistant, we keep it simple.
--    All operations are allowed through the service role key
--    (used server-side) and the anon key (used client-side).
--    Tighten these policies if you add multi-user auth.
-- -----------------------------------------------------------
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Open policies for single-user / personal use:
CREATE POLICY "Allow all for anon" ON public.conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON public.messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON public.alerts FOR ALL USING (true) WITH CHECK (true);

-- -----------------------------------------------------------
-- 6. HELPER FUNCTION — update updated_at automatically
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
