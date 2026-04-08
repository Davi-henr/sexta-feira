"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import { useSpeech } from "@/hooks/useSpeech";
import { useProactive } from "@/hooks/useProactive";
import { useAlerts } from "@/hooks/useAlerts";
import type { DBAlert } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";

// ── 3D Particle Sphere ────────────────────────────────────────────────────────

function ParticleSphere({ volume, isFocusMode, isProcessing }: { volume: number; isFocusMode: boolean; isProcessing: boolean }) {
  const points = useMemo(() => {
    const p = new Float32Array(5000 * 3);
    for (let i = 0; i < 5000; i++) {
        const r = 2;
        const theta = 2 * Math.PI * Math.random();
        const phi = Math.acos(2 * Math.random() - 1);
        p[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        p[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        p[i * 3 + 2] = r * Math.cos(phi);
    }
    return p;
  }, []);

  const ref = useRef<any>();

  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.x -= delta / (isProcessing ? 5 : 10);
    ref.current.rotation.y -= delta / (isProcessing ? 8 : 15);
    
    // Scale jumps with volume
    const targetScale = 1 + volume * 1.5;
    const currentScale = ref.current.scale.x;
    const newScale = currentScale + (targetScale - currentScale) * 0.2;
    ref.current.scale.set(newScale, newScale, newScale);
  });

  const color = isFocusMode ? "#ff2a2a" : isProcessing ? "#aa80ff" : "#00f0ff";

  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      <Points ref={ref} positions={points} stride={3} frustumCulled={false}>
        <PointMaterial 
            transparent 
            color={color} 
            size={0.03} 
            sizeAttenuation={true} 
            depthWrite={false} 
            opacity={0.6 + (volume * 0.4)} 
        />
      </Points>
    </group>
  );
}

// ── Types & Interfaces ────────────────────────────────────────────────────────

interface PanelData {
  id: string;
  type: "image" | "text" | "alert";
  content?: string;
  url?: string;
  title?: string;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FridayHUD() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  
  // UI State
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [panels, setPanels] = useState<PanelData[]>([]);
  const [lastSpeech, setLastSpeech] = useState<{role: "user"|"assistant", text: string} | null>(null);

  // ── Send message ────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string, opts?: { isProactive?: boolean }) => {
      if (!text.trim() || isLoading) return;

      if (!opts?.isProactive) {
        setLastSpeech({ role: "user", text });
      }

      setIsLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, conversationId }),
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        if (data.conversationId && !conversationId) {
          setConversationId(data.conversationId);
          localStorage.setItem("friday_conversation_id", data.conversationId);
        }

        // Process UI Actions (Modo Foco, Web Search Images, etc)
        if (data.ui_actions && Array.isArray(data.ui_actions)) {
            data.ui_actions.forEach((action: any) => {
                if (action.name === "toggle_focus_mode") {
                    setIsFocusMode(prev => !prev);
                }
                if (action.name === "web_search" && action.data?.images?.length > 0) {
                    const newPanels = action.data.images.map((url: string, i: number) => ({
                        id: crypto.randomUUID(),
                        type: "image",
                        url: url
                    }));
                    setPanels(prev => [...newPanels, ...prev].slice(0, 4)); // max 4 panels
                }
            });
        }

        if (data.reply) {
          setLastSpeech({ role: "assistant", text: data.reply });
          speech.speak(data.reply);
        }
      } catch (err) {
        setLastSpeech({ role: "assistant", text: "Erro de conexão com o satélite primário, Senhor." });
        speech.speak("Erro de conexão com o satélite primário, Senhor.");
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
      sendMessage(text);
    },
    onError: (err) => console.warn("[Speech]", err),
    lang: "pt-BR",
  });

  // ── Proactive & Alerts ──────────────────────────────────────────────────

  const proactive = useProactive({
    conversationId,
    silenceThresholdMs: 5 * 60 * 1000,
    enabled: micEnabled,
    isActive: speech.state !== "idle" || isLoading,
    onProactiveMessage: (reply, convId) => {
      if (!conversationId) setConversationId(convId);
      setLastSpeech({ role: "assistant", text: reply });
      speech.speak(reply);
    },
  });

  useAlerts({
    onAlertTriggered: (alert) => {
      const msg = `Alerta ativado, Senhor: ${alert.label}`;
      setLastSpeech({ role: "assistant", text: msg });
      speech.speak(msg);
      setPanels(prev => [{ id: crypto.randomUUID(), type: "alert", title: "ALERTA", content: alert.label }, ...prev].slice(0,4));
    },
  });

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

  // Keep mic active
  useEffect(() => {
    if (micEnabled && speech.state === "idle" && !isLoading) {
      const t = setTimeout(() => speech.startListening(), 300);
      return () => clearTimeout(t);
    }
  }, [micEnabled, speech.state, isLoading]);

  // Restore ID
  useEffect(() => {
    const stored = localStorage.getItem("friday_conversation_id");
    if (stored) setConversationId(stored);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const themeColor = isFocusMode ? "#ff2a2a" : "#00f0ff";
  const themeGlow = isFocusMode ? "rgba(255, 42, 42, 0.2)" : "rgba(0, 240, 255, 0.2)";

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black font-mono text-xs">
        
      {/* ── 3D Canvas Background ── */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
          <ParticleSphere volume={speech.volume} isFocusMode={isFocusMode} isProcessing={isLoading || speech.state === "processing"} />
        </Canvas>
      </div>

      {/* ── HUD Overlay (Z-10) ── */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6">
        
        {/* Top Header */}
        <header className="flex justify-between items-start">
            <div>
                <h1 className="font-display text-2xl tracking-[0.3em] font-bold" style={{ color: themeColor, textShadow: `0 0 10px ${themeColor}` }}>
                    {isFocusMode ? "J.A.R.V.I.S // MODO FOCO" : "J.A.R.V.I.S // HUD"}
                </h1>
                <p className="tracking-widest opacity-60 mt-2" style={{ color: themeColor }}>
                    SYS_BUILD 3.0.0 · {conversationId ? `SESSION:${conversationId.slice(0,8)}` : "NO_SESSION"}
                </p>
            </div>
            
            <div className="text-right">
                <div className="flex items-center gap-2 justify-end">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: themeColor }} />
                    <span style={{ color: themeColor }}>SYSTEM ONLINE</span>
                </div>
                <p className="opacity-60 mt-2" style={{ color: themeColor }}>{new Date().toLocaleTimeString('pt-BR')}</p>
            </div>
        </header>

        {/* Floating Panels Area */}
        <div className="absolute top-32 left-8 w-64 space-y-6">
            <AnimatePresence>
                {panels.map((panel, idx) => (
                    <motion.div
                        key={panel.id}
                        initial={{ opacity: 0, x: -50, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="p-3 border bg-black/40 backdrop-blur-md rounded pointer-events-auto"
                        style={{ borderColor: themeGlow, boxShadow: `0 0 15px ${themeGlow}` }}
                    >
                        {panel.type === "image" && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={panel.url} alt="Pesquisa" className="w-full h-32 object-cover rounded opacity-80 mix-blend-screen" />
                        )}
                        {panel.type === "alert" && (
                            <div className="text-center p-2">
                                <div style={{ color: "#ffb300" }} className="mb-2 uppercase font-bold tracking-widest">{panel.title}</div>
                                <div className="text-white opacity-80">{panel.content}</div>
                            </div>
                        )}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>

        {/* Bottom Subtitles & Controls */}
        <footer className="w-full flex flex-col items-center pb-8 gap-6">
            {/* Subtitles (Last spoken message) */}
            <AnimatePresence mode="wait">
                {lastSpeech && (
                    <motion.div
                        key={lastSpeech.text}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="max-w-3xl text-center backdrop-blur-sm bg-black/30 p-4 rounded-xl border"
                        style={{ 
                            borderColor: themeGlow,
                            color: lastSpeech.role === "assistant" ? themeColor : "white" 
                        }}
                    >
                        <span className="uppercase opacity-50 tracking-widest text-[9px] block mb-2">
                            {lastSpeech.role === "assistant" ? "SISTEMA" : "SENHOR"}
                        </span>
                        <p className="text-lg font-body leading-relaxed">{lastSpeech.text}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Mic Control */}
            <button
                onClick={handleMicToggle}
                className="pointer-events-auto px-12 py-3 uppercase tracking-[0.2em] font-bold transition-all"
                style={{
                    backgroundColor: micEnabled ? themeGlow : "transparent",
                    color: themeColor,
                    border: `1px solid ${themeColor}`,
                    boxShadow: micEnabled ? `0 0 20px ${themeGlow}` : "none"
                }}
            >
                {micEnabled ? "Microfone Ativo" : "Iniciar Escuta"}
            </button>
        </footer>
      </div>
    </div>
  );
}
