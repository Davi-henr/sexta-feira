"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeech } from "@/hooks/useSpeech";
import { useProactive } from "@/hooks/useProactive";
import { useAlerts } from "@/hooks/useAlerts";
import type { DBAlert } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isProactive?: boolean;
  isAlert?: boolean;
}

// ── Orb Visual Component ──────────────────────────────────────────────────────

function FridayOrb({ state, volume }: { state: string; volume: number }) {
  const orbClass =
    state === "listening"   ? "orb-listening" :
    state === "speaking"    ? "orb-speaking"  :
    state === "processing"  ? "orb-processing" : "orb-idle";

  const mainColor =
    state === "listening" ? "#ff4444" :
    state === "speaking"  ? "#00f0ff" :
    state === "processing"? "#aa80ff" : "#00f0ff";

  const scale = 1 + volume * 0.15;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
      {/* Outer decorative ring */}
      <div
        className="ring-outer absolute border rounded-full"
        style={{
          width: 210, height: 210,
          borderColor: `${mainColor}22`,
          borderTopColor: mainColor,
          borderWidth: 1,
        }}
      />
      {/* Middle ring */}
      <div
        className="ring-inner absolute border rounded-full"
        style={{
          width: 175, height: 175,
          borderColor: `${mainColor}15`,
          borderRightColor: mainColor,
          borderWidth: 1,
          opacity: 0.6,
        }}
      />
      {/* Volume-responsive ring */}
      <div
        className="absolute rounded-full transition-all duration-75"
        style={{
          width: `${130 + volume * 30}px`,
          height: `${130 + volume * 30}px`,
          border: `1px solid ${mainColor}`,
          opacity: 0.15 + volume * 0.3,
        }}
      />
      {/* Core orb */}
      <div
        className={`${orbClass} absolute rounded-full`}
        style={{
          width: 100, height: 100,
          background: `radial-gradient(circle at 35% 35%, ${mainColor}33, transparent 60%), radial-gradient(circle, ${mainColor}18 0%, transparent 70%)`,
          border: `1px solid ${mainColor}66`,
          transform: `scale(${scale})`,
          transition: "transform 0.07s ease-out",
        }}
      >
        {/* Inner glow core */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at center, ${mainColor}40 0%, transparent 65%)`,
          }}
        />
      </div>

      {/* State label */}
      <div
        className="absolute bottom-0 font-mono text-xs tracking-widest uppercase"
        style={{ color: mainColor, opacity: 0.7, fontSize: 9, bottom: -2 }}
      >
        {state === "idle"       ? "STANDBY" :
         state === "listening"  ? "ESCUTANDO" :
         state === "processing" ? "PROCESSANDO" : "FALANDO"}
      </div>
    </div>
  );
}

// ── Waveform Component ────────────────────────────────────────────────────────

function Waveform({ active, color = "#00f0ff" }: { active: boolean; color?: string }) {
  const bars = [0.3, 0.6, 1, 0.8, 0.5, 0.9, 0.4, 0.7, 1, 0.6, 0.3];
  return (
    <div className="flex items-center gap-0.5 h-5">
      {bars.map((h, i) => (
        <div
          key={i}
          className="wave-bar rounded-full"
          style={{
            width: 3,
            height: `${h * 20}px`,
            background: color,
            opacity: active ? 0.8 : 0.2,
            "--delay": active ? `${0.1 * i}s` : "0s",
            animationPlayState: active ? "running" : "paused",
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ── Alert Toast ───────────────────────────────────────────────────────────────

function AlertToast({ alert, onDismiss }: { alert: DBAlert; onDismiss: () => void }) {
  return (
    <div
      className="alert-flash border rounded-lg p-3 mb-2 font-body text-sm"
      style={{ borderColor: "var(--amber-alert)", background: "rgba(255,179,0,0.06)" }}
    >
      <div className="flex items-start gap-2">
        <span style={{ color: "var(--amber-alert)", fontSize: 16 }}>⚠</span>
        <div className="flex-1">
          <div className="font-mono text-xs mb-1" style={{ color: "var(--amber-alert)", opacity: 0.8 }}>
            ALERTA ATIVADO
          </div>
          <div style={{ color: "var(--text-primary)" }}>{alert.label}</div>
          {alert.trigger_data && (
            <div className="mt-1 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
              {JSON.stringify(alert.trigger_data)}
            </div>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-xs font-mono px-2 py-0.5 rounded border transition-colors"
          style={{
            borderColor: "var(--amber-alert)",
            color: "var(--amber-alert)",
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FridayPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [alertQueue, setAlertQueue] = useState<DBAlert[]>([]);
  const [micEnabled, setMicEnabled] = useState(false);
  const [inputText, setInputText] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Scroll to bottom on new messages ──────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send message (unified handler) ───────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string, opts?: { isProactive?: boolean }) => {
      if (!text.trim() || isLoading) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      if (!opts?.isProactive) {
        setMessages((prev) => [...prev, userMsg]);
      }

      setIsLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, conversationId }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Erro na comunicação com a API.");
        }

        if (data.conversationId && !conversationId) {
          setConversationId(data.conversationId);
          localStorage.setItem("friday_conversation_id", data.conversationId);
        }

        if (data.reply) {
          const assistantMsg: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.reply,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
          speech.speak(data.reply);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Sistema offline. Verifique a conexão.",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
        proactive.resetSilenceTimer();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLoading, conversationId]
  );

  // ── Speech ────────────────────────────────────────────────────────────────

  const speech = useSpeech({
    onTranscript: (text) => {
      setInputText("");
      sendMessage(text);
    },
    onError: (err) => console.warn("[Speech]", err),
    lang: "pt-BR",
  });

  // ── Proactive ─────────────────────────────────────────────────────────────

  const proactive = useProactive({
    conversationId,
    silenceThresholdMs: 5 * 60 * 1000,
    enabled: micEnabled,
    isActive: speech.state !== "idle" || isLoading,
    onProactiveMessage: (reply, convId) => {
      if (!conversationId) setConversationId(convId);
      const msg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply,
        timestamp: new Date(),
        isProactive: true,
      };
      setMessages((prev) => [...prev, msg]);
      speech.speak(reply);
    },
  });

  // ── Alerts ────────────────────────────────────────────────────────────────

  useAlerts({
    onAlertTriggered: (alert) => {
      setAlertQueue((prev) => [alert, ...prev]);
      // Sexta-feira announces the alert via TTS
      const msg = `Sexta-feira aqui — alerta ativado: ${alert.label}`;
      speech.speak(msg);
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: msg,
        timestamp: new Date(),
        isAlert: true,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    },
  });

  // ── Restore conversation ID ───────────────────────────────────────────────

  useEffect(() => {
    const stored = localStorage.getItem("friday_conversation_id");
    if (stored) setConversationId(stored);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleMicToggle = useCallback(() => {
    const next = !micEnabled;
    setMicEnabled(next);
    if (next) {
      speech.toggleMic();
    } else {
      speech.stopListening();
      speech.cancelSpeech();
    }
  }, [micEnabled, speech]);

  const handleTextSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputText.trim()) return;
      sendMessage(inputText);
      setInputText("");
    },
    [inputText, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleTextSubmit(e as unknown as React.FormEvent);
      }
    },
    [handleTextSubmit]
  );

  // ── Mic: re-trigger listening after speaking ──────────────────────────────

  useEffect(() => {
    if (micEnabled && speech.state === "idle" && !isLoading) {
      const t = setTimeout(() => speech.startListening(), 300);
      return () => clearTimeout(t);
    }
  }, [micEnabled, speech.state, isLoading]);

  // ── Render ────────────────────────────────────────────────────────────────

  const isActive = speech.state !== "idle" || isLoading;

  return (
    <div className="hud-grid flex flex-col h-screen relative overflow-hidden" style={{ background: "var(--midnight)" }}>
      {/* Scan line */}
      <div className="scan-line" />

      {/* Corner decorations */}
      <div className="absolute top-0 left-0 w-24 h-24 pointer-events-none">
        <div className="absolute top-3 left-3 w-6 h-6 border-l border-t" style={{ borderColor: "var(--cyan-glow)", opacity: 0.4 }} />
      </div>
      <div className="absolute top-0 right-0 w-24 h-24 pointer-events-none">
        <div className="absolute top-3 right-3 w-6 h-6 border-r border-t" style={{ borderColor: "var(--cyan-glow)", opacity: 0.4 }} />
      </div>
      <div className="absolute bottom-0 left-0 w-24 h-24 pointer-events-none">
        <div className="absolute bottom-3 left-3 w-6 h-6 border-l border-b" style={{ borderColor: "var(--cyan-glow)", opacity: 0.4 }} />
      </div>
      <div className="absolute bottom-0 right-0 w-24 h-24 pointer-events-none">
        <div className="absolute bottom-3 right-3 w-6 h-6 border-r border-b" style={{ borderColor: "var(--cyan-glow)", opacity: 0.4 }} />
      </div>

      {/* ── Header ── */}
      <header className="flex-none px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <div>
          <div className="font-display font-semibold text-lg tracking-wider glow-text" style={{ color: "var(--cyan-glow)" }}>
            SEXTA-FEIRA
          </div>
          <div className="font-mono text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            SYS_BUILD 0.1.0 · {conversationId ? `ID:${conversationId.slice(0, 8)}` : "NO_SESSION"}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--cyan-glow)", boxShadow: "0 0 6px var(--cyan-glow)" }} />
            <span className="font-mono text-xs" style={{ color: "var(--text-secondary)" }}>ONLINE</span>
          </div>
          {/* Waveform */}
          <Waveform active={speech.state === "listening"} />
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex flex-1 overflow-hidden">

        {/* ── Left Panel: Orb ── */}
        <div className="flex-none w-72 flex flex-col items-center justify-center border-r gap-6 py-8" style={{ borderColor: "var(--border-subtle)" }}>
          <FridayOrb state={speech.state} volume={speech.volume} />

          {/* Mic toggle button */}
          <button
            onClick={handleMicToggle}
            className="font-display font-medium text-sm tracking-widest uppercase px-6 py-2.5 rounded border transition-all duration-200"
            style={{
              borderColor: micEnabled ? "#ff4444" : "var(--cyan-glow)",
              color: micEnabled ? "#ff4444" : "var(--cyan-glow)",
              background: micEnabled ? "rgba(255,68,68,0.06)" : "rgba(0,240,255,0.06)",
              boxShadow: micEnabled ? "0 0 15px rgba(255,68,68,0.2)" : "var(--glow-sm)",
            }}
          >
            {micEnabled ? "◼ DESLIGAR MIC" : "⏺ ATIVAR MIC"}
          </button>

          {/* Status panel */}
          <div
            className="w-48 border rounded p-3 font-mono text-xs space-y-1.5"
            style={{ borderColor: "var(--border-subtle)", background: "rgba(0,240,255,0.02)" }}
          >
            {[
              ["ESTADO", speech.state.toUpperCase()],
              ["MICROFONE", micEnabled ? "ATIVO" : "INATIVO"],
              ["MSGS", String(messages.length)],
              ["ALERTAS", String(alertQueue.length)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span style={{ color: "var(--text-secondary)" }}>{k}</span>
                <span style={{ color: "var(--cyan-glow)" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right Panel: Conversation ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Alert queue */}
          {alertQueue.length > 0 && (
            <div className="flex-none p-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
              {alertQueue.slice(0, 3).map((alert) => (
                <AlertToast
                  key={alert.id}
                  alert={alert}
                  onDismiss={() => setAlertQueue((prev) => prev.filter((a) => a.id !== alert.id))}
                />
              ))}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="font-mono text-xs tracking-widest" style={{ color: "var(--text-secondary)" }}>
                    AGUARDANDO COMANDO
                  </div>
                  <div className="font-body text-sm" style={{ color: "var(--text-secondary)", maxWidth: 300 }}>
                    Ative o microfone ou digite para iniciar uma conversa com a Sexta-feira.
                  </div>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`msg-enter flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div
                    className="flex-none w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-bold"
                    style={{
                      background: msg.isAlert ? "rgba(255,179,0,0.1)" : "rgba(0,240,255,0.08)",
                      border: `1px solid ${msg.isAlert ? "var(--amber-alert)" : "var(--border-active)"}`,
                      color: msg.isAlert ? "var(--amber-alert)" : "var(--cyan-glow)",
                      fontSize: 9,
                    }}
                  >
                    SF
                  </div>
                )}

                <div
                  className="max-w-md rounded-lg px-4 py-2.5 font-body text-sm leading-relaxed"
                  style={
                    msg.role === "user"
                      ? {
                          background: "rgba(0,240,255,0.08)",
                          border: "1px solid rgba(0,240,255,0.2)",
                          color: "var(--text-primary)",
                        }
                      : {
                          background: msg.isAlert
                            ? "rgba(255,179,0,0.04)"
                            : msg.isProactive
                            ? "rgba(170,128,255,0.06)"
                            : "rgba(255,255,255,0.03)",
                          border: `1px solid ${msg.isAlert ? "rgba(255,179,0,0.2)" : msg.isProactive ? "rgba(170,128,255,0.2)" : "var(--border-subtle)"}`,
                          color: "var(--text-primary)",
                        }
                  }
                >
                  {msg.isProactive && (
                    <div className="font-mono text-xs mb-1" style={{ color: "rgba(170,128,255,0.7)", fontSize: 9 }}>
                      PROATIVO
                    </div>
                  )}
                  {msg.content}
                  <div
                    className="font-mono mt-1"
                    style={{ color: "var(--text-secondary)", fontSize: 9 }}
                  >
                    {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>

                {msg.role === "user" && (
                  <div
                    className="flex-none w-7 h-7 rounded-full flex items-center justify-center font-mono"
                    style={{
                      background: "rgba(0,240,255,0.06)",
                      border: "1px solid rgba(0,240,255,0.15)",
                      color: "var(--text-secondary)",
                      fontSize: 9,
                    }}
                  >
                    USR
                  </div>
                )}
              </div>
            ))}

            {/* Processing indicator */}
            {isLoading && (
              <div className="flex gap-3 justify-start msg-enter">
                <div
                  className="flex-none w-7 h-7 rounded-full flex items-center justify-center font-mono"
                  style={{
                    background: "rgba(0,240,255,0.08)",
                    border: "1px solid var(--border-active)",
                    color: "var(--cyan-glow)",
                    fontSize: 9,
                  }}
                >
                  SF
                </div>
                <div
                  className="rounded-lg px-4 py-2.5 font-mono text-xs flex items-center gap-2"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--cyan-dim)",
                  }}
                >
                  <Waveform active={true} color="var(--cyan-glow)" />
                  PROCESSANDO
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Text Input ── */}
          <div
            className="flex-none px-4 py-3 border-t"
            style={{ borderColor: "var(--border-subtle)", background: "rgba(0,0,0,0.3)" }}
          >
            <form onSubmit={handleTextSubmit} className="flex gap-2 items-center">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite um comando ou pergunta..."
                className="flex-1 bg-transparent font-body text-sm outline-none px-3 py-2 rounded border transition-colors"
                style={{
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                  caretColor: "var(--cyan-glow)",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--border-active)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border-subtle)")}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isLoading}
                className="font-display font-medium text-xs tracking-wider uppercase px-4 py-2 rounded border transition-all disabled:opacity-30"
                style={{
                  borderColor: "var(--cyan-glow)",
                  color: "var(--cyan-glow)",
                  background: "rgba(0,240,255,0.06)",
                }}
              >
                ENVIAR
              </button>
              {speech.state === "speaking" && (
                <button
                  type="button"
                  onClick={speech.cancelSpeech}
                  className="font-display font-medium text-xs tracking-wider uppercase px-3 py-2 rounded border transition-all"
                  style={{
                    borderColor: "#ff4444",
                    color: "#ff4444",
                    background: "rgba(255,68,68,0.06)",
                  }}
                >
                  PARAR
                </button>
              )}
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
