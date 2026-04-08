"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useSpeech } from "@/hooks/useSpeech";
import { useProactive } from "@/hooks/useProactive";
import { useAlerts } from "@/hooks/useAlerts";
import type { DBAlert } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";

// ── 3D Particle Sphere ────────────────────────────────────────────────────────

function ParticleSphere({ volume, isFocusMode, isProcessing }: { volume: number; isFocusMode: boolean; isProcessing: boolean }) {
  const numParticles = 40000; // MUCH denser for pure hologram feel
  
  const points = useMemo(() => {
    const p = new Float32Array(numParticles * 3);
    for (let i = 0; i < numParticles; i++) {
        // Create a perfect hollow sphere core + scattered particles
        const r = Math.random() > 0.8 ? 3.5 + Math.random() * 0.5 : 3.5; 
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
    ref.current.rotation.x -= delta / (isProcessing ? 2 : 5);
    ref.current.rotation.y -= delta / (isProcessing ? 3 : 8);
    
    // Scale jumps with volume, much larger central sphere
    const targetScale = 1.2 + volume * 2.5; 
    const currentScale = ref.current.scale.x;
    const newScale = currentScale + (targetScale - currentScale) * 0.15;
    ref.current.scale.set(newScale, newScale, newScale);
  });

  const color = isFocusMode ? "#ff1a1a" : isProcessing ? "#8a2be2" : "#00f0ff";

  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      <Points ref={ref} positions={points} stride={3} frustumCulled={false}>
        <PointMaterial 
            transparent 
            color={color} 
            size={0.012} 
            sizeAttenuation={true} 
            depthWrite={false} 
            opacity={0.8} 
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
                    setPanels(prev => [...newPanels, ...prev].slice(0, 5)); // max 5 panels
                }
            });
        }

        if (data.reply) {
          setLastSpeech({ role: "assistant", text: data.reply });
          speech.speak(data.reply);
        }
      } catch (err) {
        setLastSpeech({ role: "assistant", text: "Me desculpe Senhor. O link temporal de Quota do Google recusou a conexão por limite de requisições. Tente em 1 minuto." });
        speech.speak("Me desculpe Senhor. O link temporal de Quota do Google recusou a conexão por limite de requisições.");
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
      setPanels(prev => [{ id: crypto.randomUUID(), type: "alert", title: "ALERTA", content: alert.label }, ...prev].slice(0,5));
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

  const themeColor = isFocusMode ? "#ff1a1a" : "#00f0ff";
  const themeGlow = isFocusMode ? "rgba(255, 26, 26, 0.4)" : "rgba(0, 240, 255, 0.4)";

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black font-mono text-xs">
        
      {/* ── 3D Canvas Background ── */}
      <div className="absolute inset-0 z-0 flex items-center justify-center">
        <Canvas camera={{ position: [0, 0, 8], fov: 60 }} gl={{ antialias: true }}>
          <ParticleSphere volume={speech.volume} isFocusMode={isFocusMode} isProcessing={isLoading || speech.state === "processing"} />
          <EffectComposer>
            <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} intensity={2.0} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* ── HUD Overlay (Z-10) ── */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-8">
        
        {/* Top Header */}
        <header className="flex justify-between items-start">
            <div>
                <h1 className="font-display text-4xl tracking-[0.4em] font-black" style={{ color: themeColor, textShadow: `0 0 15px ${themeColor}` }}>
                    {isFocusMode ? "SEXTA-FEIRA // MODO FOCO" : "SEXTA-FEIRA"}
                </h1>
                <p className="tracking-widest opacity-80 mt-3 text-sm" style={{ color: themeColor }}>
                    SYS_BUILD 3.0.0 · {conversationId ? `SESSION:${conversationId.slice(0,8)}` : "NO_SESSION"}
                </p>
            </div>
            
            <div className="text-right">
                <div className="flex items-center gap-3 justify-end text-sm">
                    <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: themeColor, boxShadow: `0 0 10px ${themeColor}` }} />
                    <span style={{ color: themeColor }} className="font-bold tracking-widest">SYSTEM ONLINE</span>
                </div>
                <p className="opacity-80 mt-2 text-sm" style={{ color: themeColor }}>{new Date().toLocaleTimeString('pt-BR')}</p>
            </div>
        </header>

        {/* Floating Panels Area */}
        <div className="absolute top-1/4 left-10 w-72 space-y-8">
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
