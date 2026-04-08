"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";
import { useSpeech } from "@/hooks/useSpeech";
import { useProactive } from "@/hooks/useProactive";
import { useAlerts } from "@/hooks/useAlerts";
import { motion, AnimatePresence } from "framer-motion";

// ── Background Parallax Atoms ──────────────────────────────────────────────────

function BackgroundAtoms({ isFocusMode }: { isFocusMode: boolean }) {
  const points = useMemo(() => {
    const p = new Float32Array(800 * 3);
    for (let i = 0; i < 800; i++) {
        p[i * 3] = (Math.random() - 0.5) * 40;
        p[i * 3 + 1] = (Math.random() - 0.5) * 40;
        p[i * 3 + 2] = (Math.random() - 0.5) * 40 - 15;
    }
    return p;
  }, []);

  const ref = useRef<any>();

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y += 0.0005;
    ref.current.rotation.x += 0.0002;
    
    // Parallax interacting with mouse position
    const targetX = state.mouse.x * 2;
    const targetY = state.mouse.y * 2;
    ref.current.position.x += (targetX - ref.current.position.x) * 0.02;
    ref.current.position.y += (targetY - ref.current.position.y) * 0.02;
  });

  return (
    <Points ref={ref} positions={points} stride={3} frustumCulled={false}>
      <PointMaterial 
        transparent 
        color={isFocusMode ? "#ff4d4d" : "#4da6ff"} 
        size={0.15} 
        opacity={0.4} 
        depthWrite={false} 
        sizeAttenuation={true} 
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

// ── 3D Multi-layered Explosive Sphere ─────────────────────────────────────────

function ParticleSphere({ volume, isFocusMode, isProcessing }: { volume: number; isFocusMode: boolean; isProcessing: boolean }) {
  // Drastically reduced count to save GPU, but AdditiveBlending makes them perfectly bright
  const layer1 = useMemo(() => createSpherePoints(6000, 3.5), []);
  const layer2 = useMemo(() => createSpherePoints(2500, 3.2), []);
  const layer3 = useMemo(() => createSpherePoints(800, 2.8), []);

  function createSpherePoints(count: number, baseRadius: number) {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const r = baseRadius + (Math.random() * 0.8); 
        const theta = 2 * Math.PI * Math.random();
        const phi = Math.acos(2 * Math.random() - 1);
        p[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        p[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        p[i * 3 + 2] = r * Math.cos(phi);
    }
    return p;
  }

  const groupRef = useRef<any>();

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    groupRef.current.rotation.x -= delta / (isProcessing ? 2 : 4);
    groupRef.current.rotation.y -= delta / (isProcessing ? 3 : 6);
    
    // Explosion Effect
    const explosiveVol = Math.pow(volume, 2.0) * 8; 
    const targetScale = 1.0 + explosiveVol + (isProcessing ? 0.5 : 0);
    
    const currentScale = groupRef.current.scale.x;
    const lerpSpeed = targetScale > currentScale ? 0.3 : 0.05;
    
    const newScale = currentScale + (targetScale - currentScale) * lerpSpeed;
    groupRef.current.scale.set(newScale, newScale, newScale);
    
    // Smooth Mouse Tracking
    const targetX = state.mouse.x * 2;
    const targetY = state.mouse.y * 2;
    groupRef.current.position.x += (targetX - groupRef.current.position.x) * 0.1;
    groupRef.current.position.y += (targetY - groupRef.current.position.y) * 0.1;
  });

  const baseColor = isFocusMode ? "#ff0000" : isProcessing ? "#9933ff" : "#00d4ff";
  const coreColor = isFocusMode ? "#ffaaaa" : "#ffffff";

  return (
    <group ref={groupRef} rotation={[0, 0, Math.PI / 6]}>
      {/* Additive blending makes overlapping points literally glow like stars (No PostProcessing required) */}
      <Points positions={layer1} stride={3} frustumCulled={false}>
        <PointMaterial transparent color={baseColor} size={0.03} opacity={0.6} depthWrite={false} sizeAttenuation={true} blending={THREE.AdditiveBlending}/>
      </Points>
      <Points positions={layer2} stride={3} frustumCulled={false}>
        <PointMaterial transparent color={baseColor} size={0.06} opacity={0.8} depthWrite={false} sizeAttenuation={true} blending={THREE.AdditiveBlending}/>
      </Points>
      <Points positions={layer3} stride={3} frustumCulled={false}>
        <PointMaterial transparent color={coreColor} size={0.12} opacity={1.0} depthWrite={false} sizeAttenuation={true} blending={THREE.AdditiveBlending}/>
      </Points>
    </group>
  );
}

// ── Types ───────────────────────────────────────────────────────────────────
interface PanelData {
  id: string;
  type: "image" | "alert";
  content?: string;
  url?: string;
  title?: string;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FridayHUD() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [timeStr, setTimeStr] = useState<string>("");
  
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [panels, setPanels] = useState<PanelData[]>([]);
  const [lastSpeech, setLastSpeech] = useState<{role: "user"|"assistant", text: string} | null>(null);

  // Client-side clock to avoid hydration mismatch
  useEffect(() => {
    const tick = () => setTimeStr(new Date().toLocaleTimeString('pt-BR'));
    tick(); // initial
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

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

        if (data.ui_actions && Array.isArray(data.ui_actions)) {
            data.ui_actions.forEach((action: any) => {
                if (action.name === "toggle_focus_mode") {
                    setIsFocusMode(prev => !prev);
                }
                if (action.name === "web_search" && action.data?.images?.length > 0) {
                    const newPanels = action.data.images.map((url: string) => ({
                        id: crypto.randomUUID(),
                        type: "image" as "image",
                        url: url
                    }));
                    setPanels(prev => [...newPanels, ...prev].slice(0, 5));
                }
            });
        }

        if (data.reply) {
          setLastSpeech({ role: "assistant", text: data.reply });
          speech.speak(data.reply);
        }
      } catch (err) {
        setLastSpeech({ role: "assistant", text: "Me desculpe Senhor. Erro na conexão matriz principal." });
        speech.speak("Me desculpe Senhor. Erro na conexão matriz principal.");
      } finally {
        setIsLoading(false);
        proactive.resetSilenceTimer();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLoading, conversationId]
  );

  const speech = useSpeech({
    onTranscript: (text) => sendMessage(text),
    onError: (err) => console.warn("[Speech]", err),
    lang: "pt-BR",
  });

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

  const handleMicToggle = useCallback(() => {
    const next = !micEnabled;
    setMicEnabled(next);
    if (next) speech.toggleMic();
    else { speech.stopListening(); speech.cancelSpeech(); }
  }, [micEnabled, speech]);

  useEffect(() => {
    if (micEnabled && speech.state === "idle" && !isLoading) {
      const t = setTimeout(() => speech.startListening(), 300);
      return () => clearTimeout(t);
    }
  }, [micEnabled, speech.state, isLoading]);

  useEffect(() => {
    const stored = localStorage.getItem("friday_conversation_id");
    if (stored) setConversationId(stored);
  }, []);

  const themeColor = isFocusMode ? "#ff1a1a" : "#00f0ff";
  const themeGlow = isFocusMode ? "rgba(255, 26, 26, 0.6)" : "rgba(0, 240, 255, 0.6)";

  return (
    <div className="fixed inset-0 overflow-hidden bg-black font-mono text-xs selection:bg-cyan-500/30">
        
      {/* ── 3D Canvas Background (Takes explicitly exactly 100vh) ── */}
      <div className="absolute inset-0 z-0 bg-transparent">
        <Canvas camera={{ position: [0, 0, 10], fov: 75 }} dpr={[1, 2]} style={{ width: '100%', height: '100%' }}>
          <color attach="background" args={["#000000"]} />
          {/* Fog to hide extreme edges smoothly */}
          <fog attach="fog" args={["#000", 5, 25]} />
          
          <BackgroundAtoms isFocusMode={isFocusMode} />
          <ParticleSphere volume={speech.volume} isFocusMode={isFocusMode} isProcessing={isLoading || speech.state === "processing"} />
          {/* EFFECT COMPOSER AND BLOOM REMOVED TO PREVENT BUGS - We use AdditiveBlending instead for glow */}
        </Canvas>
      </div>

      {/* ── HUD Overlay (Z-10) ── */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 sm:p-10">
        
        {/* Top Header - Pure floating hologram style */}
        <header className="flex justify-between items-start shrink-0">
            <div>
                <h1 className="font-display text-3xl sm:text-5xl tracking-[0.3em] font-black uppercase" style={{ color: themeColor, textShadow: `0 0 20px ${themeColor}, 0 0 40px ${themeColor}88` }}>
                    {isFocusMode ? "Sexta-Feira // Foco" : "Sexta-Feira"}
                </h1>
                <p className="tracking-widest opacity-80 mt-3 text-xs sm:text-sm font-bold uppercase" style={{ color: themeColor, textShadow: `0 0 10px ${themeColor}` }}>
                    SYS_BUILD 3.2.0 · {conversationId ? `LINK:${conversationId.slice(0,8)}` : "OFFLINE_LINK"}
                </p>
            </div>
            
            <div className="text-right">
                <div className="flex items-center gap-3 justify-end text-xs sm:text-sm">
                    <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: themeColor, boxShadow: `0 0 15px ${themeColor}` }} />
                    <span style={{ color: themeColor, textShadow: `0 0 10px ${themeColor}` }} className="font-bold tracking-[0.2em] uppercase hidden sm:block">
                        SISTEMA ATIVO
                    </span>
                </div>
                <p className="opacity-90 mt-2 text-lg sm:text-xl font-bold tracking-widest" style={{ color: themeColor, textShadow: `0 0 10px ${themeColor}` }}>
                    {timeStr || "00:00:00"}
                </p>
            </div>
        </header>

        {/* Floating Holographic Panels Area */}
        <div className="absolute top-1/4 left-4 sm:left-10 w-64 sm:w-80 space-y-8 z-20">
            <AnimatePresence>
                {panels.map((panel) => (
                    <motion.div
                        key={panel.id}
                        initial={{ opacity: 0, x: -100, rotateY: 90 }}
                        animate={{ opacity: 1, x: 0, rotateY: 0 }}
                        exit={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
                        transition={{ type: "spring", damping: 20 }}
                        className="p-1 border bg-transparent pointer-events-auto relative overflow-hidden"
                        style={{ borderColor: themeGlow, boxShadow: `0 0 30px ${themeGlow}44` }}
                    >
                        {/* Corner Accents */}
                        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2" style={{ borderColor: themeColor }} />
                        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2" style={{ borderColor: themeColor }} />
                        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2" style={{ borderColor: themeColor }} />
                        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2" style={{ borderColor: themeColor }} />
                        
                        <div className="bg-black/60 backdrop-blur-xl p-2 w-full h-full">
                            {panel.type === "image" && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={panel.url} alt="Holograma" className="w-full h-32 sm:h-40 object-cover opacity-90 mix-blend-screen grayscale-[20%] contrast-125" />
                            )}
                            {panel.type === "alert" && (
                                <div className="text-center p-4">
                                    <div style={{ color: "#ffb300", textShadow: "0 0 10px #ffb300" }} className="mb-2 text-lg uppercase font-black tracking-widest">{panel.title}</div>
                                    <div className="text-white opacity-90 font-bold text-sm tracking-wider">{panel.content}</div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>

        {/* Central Subtitles & Controls */}
        <footer className="w-full flex-shrink-0 flex flex-col items-center pb-4 sm:pb-8 gap-4 sm:gap-8 relative z-30">
            {/* Holographic Subtitles */}
            <AnimatePresence mode="wait">
                {lastSpeech && (
                    <motion.div
                        key={lastSpeech.text}
                        initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)", y: 20 }}
                        animate={{ opacity: 1, scale: 1, filter: "blur(0px)", y: 0 }}
                        exit={{ opacity: 0, y: 20, filter: "blur(10px)" }}
                        className="max-w-xl sm:max-w-4xl text-center px-4 sm:px-12 py-2 sm:py-6 bg-transparent"
                    >
                        <span className="uppercase tracking-[0.4em] font-black text-[10px] sm:text-xs block mb-2 sm:mb-4" style={{ color: lastSpeech.role === "assistant" ? themeColor : "#fff", opacity: 0.9, textShadow: `0 0 15px ${lastSpeech.role === "assistant" ? themeColor : "#fff"}` }}>
                            {lastSpeech.role === "assistant" ? "SEXTA-FEIRA" : "SENHOR"}
                        </span>
                        <p className="text-xl sm:text-3xl font-body leading-relaxed font-bold tracking-widest drop-shadow-2xl" 
                           style={{ color: lastSpeech.role === "assistant" ? themeColor : "#ffffff", textShadow: `0 0 20px ${lastSpeech.role === "assistant" ? themeColor : "#ffffff"}, 0 0 40px ${themeGlow}` }}>
                            "{lastSpeech.text}"
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Futuristic Mic Toggle */}
            <button
                onClick={handleMicToggle}
                className="pointer-events-auto px-8 sm:px-16 py-3 sm:py-4 uppercase tracking-[0.3em] font-black text-xs sm:text-sm transition-all duration-300 relative overflow-hidden group"
                style={{
                    color: micEnabled ? "#000" : themeColor,
                    backgroundColor: micEnabled ? themeColor : "transparent",
                    border: `1px solid ${themeColor}`,
                    boxShadow: micEnabled ? `0 0 30px ${themeColor}, inset 0 0 20px ${themeColor}` : "none"
                }}
            >
                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity" />
                {micEnabled ? "LIGAÇÃO ESTABELECIDA" : "INICIAR CONEXÃO"}
            </button>
        </footer>
      </div>
    </div>
  );
}
