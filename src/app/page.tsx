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
    const p = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
        p[i * 3] = (Math.random() - 0.5) * 50;
        p[i * 3 + 1] = (Math.random() - 0.5) * 50;
        p[i * 3 + 2] = (Math.random() - 0.5) * 40 - 15;
    }
    return p;
  }, []);

  const ref = useRef<any>();

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y += 0.0002;
    ref.current.rotation.x += 0.0001;
    
    // Parallax interacting with mouse position
    const targetX = state.mouse.x * 3;
    const targetY = state.mouse.y * 3;
    ref.current.position.x += (targetX - ref.current.position.x) * 0.02;
    ref.current.position.y += (targetY - ref.current.position.y) * 0.02;
  });

  return (
    <Points ref={ref} positions={points} stride={3} frustumCulled={false}>
      <PointMaterial 
        transparent 
        color={isFocusMode ? "#ff1a1a" : "#00f0ff"} 
        size={0.10} 
        opacity={0.3} 
        depthWrite={false} 
        sizeAttenuation={true} 
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

// ── 3D Multi-layered Explosive Sphere ─────────────────────────────────────────

function ParticleSphere({ volume, isFocusMode, isProcessing }: { volume: number; isFocusMode: boolean; isProcessing: boolean }) {
  const layer1 = useMemo(() => createSpherePoints(8000, 3.5), []);
  const layer2 = useMemo(() => createSpherePoints(3500, 3.2), []);
  const layer3 = useMemo(() => createSpherePoints(1500, 2.7), []);

  function createSpherePoints(count: number, baseRadius: number) {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const r = baseRadius + (Math.random() * 0.9); 
        const theta = 2 * Math.PI * Math.random();
        const phi = Math.acos(2 * Math.random() - 1);
        p[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        p[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        p[i * 3 + 2] = r * Math.cos(phi);
    }
    return p;
  }

  const groupRef = useRef<any>();
  const coreRef = useRef<any>();

  useFrame((state, delta) => {
    if (!groupRef.current || !coreRef.current) return;
    
    groupRef.current.rotation.x -= delta / (isProcessing ? 1.5 : 5);
    groupRef.current.rotation.y -= delta / (isProcessing ? 2.5 : 8);

    coreRef.current.rotation.y += delta / 2;
    
    // Explosion Effect
    const explosiveVol = Math.pow(volume, 2.5) * 12; 
    const targetScale = 1.0 + explosiveVol + (isProcessing ? 0.3 : 0);
    
    const currentScale = groupRef.current.scale.x;
    const lerpSpeed = targetScale > currentScale ? 0.4 : 0.03;
    
    const newScale = currentScale + (targetScale - currentScale) * lerpSpeed;
    groupRef.current.scale.set(newScale, newScale, newScale);
    
    // Smooth Mouse Tracking
    const targetX = state.mouse.x * 2.5;
    const targetY = state.mouse.y * 2.5;
    groupRef.current.position.x += (targetX - groupRef.current.position.x) * 0.08;
    groupRef.current.position.y += (targetY - groupRef.current.position.y) * 0.08;
  });

  const baseColor = isFocusMode ? "#ff0000" : isProcessing ? "#b366ff" : "#00d4ff";
  const coreColor = isFocusMode ? "#ffaaaa" : "#ffffff";

  return (
    <group ref={groupRef} rotation={[0, 0, Math.PI / 6]}>
      <Points positions={layer1} stride={3} frustumCulled={false}>
        <PointMaterial transparent color={baseColor} size={0.03} opacity={0.7} depthWrite={false} sizeAttenuation={true} blending={THREE.AdditiveBlending}/>
      </Points>
      <Points positions={layer2} stride={3} frustumCulled={false}>
        <PointMaterial transparent color={isProcessing ? "#ffffff" : baseColor} size={0.06} opacity={0.9} depthWrite={false} sizeAttenuation={true} blending={THREE.AdditiveBlending}/>
      </Points>
      <Points ref={coreRef} positions={layer3} stride={3} frustumCulled={false}>
        <PointMaterial transparent color={coreColor} size={0.15} opacity={1.0} depthWrite={false} sizeAttenuation={true} blending={THREE.AdditiveBlending}/>
      </Points>
    </group>
  );
}

// ── Types ───────────────────────────────────────────────────────────────────
interface PanelData {
  id: string;
  type: "search" | "alert";
  content?: string;
  url?: string;
  title?: string;
  sources?: { title: string; url: string }[];
  images?: string[];
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
                if (action.name === "web_search") {
                    const searchSources = action.data?.sources || [];
                    const searchImages = action.data?.images || [];
                    
                    if (searchSources.length > 0 || searchImages.length > 0) {
                        setPanels(prev => [{
                            id: crypto.randomUUID(),
                            type: "search",
                            title: "PESQUISA DE REDE",
                            sources: searchSources,
                            images: searchImages
                        }, ...prev].slice(0, 3)); // Keep max 3 heavy panels
                    }
                }
            });
        }

        if (data.reply) {
          setLastSpeech({ role: "assistant", text: data.reply });
          speech.speak(data.reply);
        }
      } catch (err) {
        setLastSpeech({ role: "assistant", text: "Me desculpe Senhor. Erro na conexão matriz principal." });
        speech.speak("Me desculpe Senhor. Erro na matriz principal de processamento.");
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
      setPanels(prev => [{ id: crypto.randomUUID(), type: "alert", title: "ALERTA", content: alert.label }, ...prev].slice(0,3));
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

  const themeColor = isFocusMode ? "#ff3333" : "#00e5ff";
  const themeGlow = isFocusMode ? "rgba(255, 51, 51, 0.4)" : "rgba(0, 229, 255, 0.4)";

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#050505' }} className="font-mono text-xs selection:bg-cyan-500/30">
        
      {/* ── 3D Canvas Background ── */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0 }} className="bg-transparent">
        <Canvas camera={{ position: [0, 0, 10], fov: 75 }} dpr={[1, 2]} style={{ width: '100vw', height: '100vh', display: 'block' }}>
          <color attach="background" args={["#00050a"]} />
          <fog attach="fog" args={["#00050a", 5, 25]} />
          
          <BackgroundAtoms isFocusMode={isFocusMode} />
          <ParticleSphere volume={speech.volume} isFocusMode={isFocusMode} isProcessing={isLoading || speech.state === "processing"} />
        </Canvas>
      </div>

      {/* ── Pure CSS HUD Overlays ── */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{
          background: `radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.8) 100%)`, // Vignette
      }} />
      <div className="absolute inset-0 pointer-events-none z-0 mix-blend-overlay opacity-20" style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, ${themeColor} 2px, ${themeColor} 4px)` // Scanlines
      }} />

      {/* ── HUD Center Reticles ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-30">
          <motion.div 
            animate={{ rotate: 360 }} 
            transition={{ repeat: Infinity, duration: 60, ease: "linear" }}
            className="w-[800px] h-[800px] rounded-full border border-dashed opacity-20" 
            style={{ borderColor: themeColor }} 
          />
          <motion.div 
            animate={{ rotate: -360 }} 
            transition={{ repeat: Infinity, duration: 40, ease: "linear" }}
            className="absolute w-[600px] h-[600px] rounded-full border-t border-b opacity-40 mix-blend-screen" 
            style={{ borderColor: themeColor }} 
          />
          {/* Inner targeting bounds */}
          <div className="absolute w-[300px] h-[300px] border border-opacity-10" style={{ borderColor: themeColor }} />
          <div className="absolute w-2 h-2 rounded-full" style={{ backgroundColor: themeColor, boxShadow: `0 0 10px ${themeColor}` }} />
      </div>

      {/* ── Outer Layout Overlay (Z-10) ── */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} className="pointer-events-none p-6 sm:p-12">
        
        {/* Top Header - Hyper Premium */}
        <header className="flex justify-between items-start shrink-0">
            <div className="relative">
                {/* Techy Deco block */}
                <div className="absolute -left-4 top-0 w-1 h-full opacity-70" style={{ backgroundColor: themeColor, boxShadow: `0 0 15px ${themeColor}` }} />
                
                <h1 className="font-display text-4xl sm:text-6xl tracking-[0.4em] font-black uppercase mix-blend-screen" style={{ color: "white", textShadow: `0 0 20px ${themeColor}, 0 0 40px ${themeColor}` }}>
                    {isFocusMode ? "F.R.I.D.A.Y // FOCUS" : "F.R.I.D.A.Y"}
                </h1>
                <div className="flex gap-4 mt-4 uppercase font-bold tracking-widest text-[10px] sm:text-xs opacity-80" style={{ color: themeColor }}>
                    <span className="border px-2 py-1" style={{ borderColor: themeColor }}>SYS_BUILD 4.0</span>
                    <span className="border px-2 py-1" style={{ borderColor: themeColor, backgroundColor: `${themeColor}22` }}>{conversationId ? `LINK:${conversationId.slice(0,8)}` : "STANDBY"}</span>
                </div>
            </div>
            
            <div className="text-right">
                <div className="flex items-center gap-3 justify-end text-xs sm:text-sm">
                    <motion.div animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="w-4 h-4 rounded-full" style={{ backgroundColor: themeColor, boxShadow: `0 0 20px ${themeColor}` }} />
                    <span style={{ color: themeColor, textShadow: `0 0 10px ${themeColor}` }} className="font-bold tracking-[0.3em] uppercase hidden sm:block">
                        MATRIX ONLINE
                    </span>
                </div>
                <p className="opacity-90 mt-4 text-3xl sm:text-4xl font-light tracking-[0.2em]" style={{ color: "white", textShadow: `0 0 20px ${themeColor}` }}>
                    {timeStr || "00:00:00"}
                </p>
            </div>
        </header>

        {/* Floating Holographic Cyberpunk Panels */}
        <div className="absolute top-[20%] left-6 sm:left-12 w-80 sm:w-[450px] space-y-6 z-20">
            <AnimatePresence>
                {panels.map((panel) => (
                    <motion.div
                        key={panel.id}
                        initial={{ opacity: 0, x: -100, clipPath: 'inset(0 100% 0 0)' }}
                        animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0 0 0)' }}
                        exit={{ opacity: 0, scale: 0.9, filter: "blur(20px)" }}
                        transition={{ type: "spring", damping: 25, mass: 1.2 }}
                        className="pointer-events-auto relative p-1 transition-all"
                    >
                        {/* High-tech Borders */}
                        <div className="absolute inset-0 border bg-black/40 backdrop-blur-xl" style={{ borderColor: themeColor, boxShadow: `inset 0 0 30px ${themeGlow}, 0 0 15px ${themeGlow}` }} />
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4" style={{ borderColor: "white" }} />
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4" style={{ borderColor: "white" }} />
                        
                        <div className="relative p-5 text-white">
                            <div className="uppercase font-black tracking-widest text-sm mb-4 border-b pb-2 flex justify-between items-center" style={{ borderColor: themeColor, color: themeColor, textShadow: `0 0 10px ${themeColor}` }}>
                                <span>{panel.title || "DADOS DO SATÉLITE"}</span>
                                <span className="animate-pulse">● REC</span>
                            </div>

                            {panel.type === "search" && (
                                <div className="space-y-4">
                                    {panel.images && panel.images.length > 0 && (
                                        <div className="grid grid-cols-3 gap-2">
                                            {panel.images.map((img, i) => (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img key={i} src={img} alt="Fonte visual" className="w-full h-24 object-cover border opacity-80 hover:opacity-100 mix-blend-screen transition-opacity" style={{ borderColor: themeColor }} />
                                            ))}
                                        </div>
                                    )}
                                    {panel.sources && panel.sources.length > 0 && (
                                        <div className="space-y-2 mt-2">
                                            <p className="text-[10px] uppercase text-gray-400 tracking-wider">Fontes Localizadas:</p>
                                            {panel.sources.slice(0, 3).map((src, i) => (
                                                <a key={i} href={src.url} target="_blank" rel="noreferrer" className="block text-xs truncate hover:underline" style={{ color: themeColor }}>
                                                    {">"} {src.title}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {panel.type === "alert" && (
                                <p className="font-bold tracking-wider text-lg opacity-90">{panel.content}</p>
                            )}
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>

        {/* Central Subtitles & Controls */}
        <footer className="w-full flex-shrink-0 flex flex-col items-center pb-8 sm:pb-12 gap-8 relative z-30">
            
            {/* Holographic Subtitles with massive Drop Shadow */}
            <AnimatePresence mode="wait">
                {lastSpeech && (
                    <motion.div
                        key={lastSpeech.text}
                        initial={{ opacity: 0, scale: 0.9, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="max-w-2xl sm:max-w-5xl text-center px-6 sm:px-16 py-4 bg-transparent"
                    >
                        <span className="uppercase tracking-[0.5em] font-black text-xs sm:text-sm block mb-4" style={{ color: lastSpeech.role === "assistant" ? themeColor : "white", textShadow: `0 0 20px ${lastSpeech.role === "assistant" ? themeColor : "white"}` }}>
                            {lastSpeech.role === "assistant" ? "F.R.I.D.A.Y" : "SENHOR"}
                        </span>
                        <p className="text-3xl sm:text-5xl font-light leading-tight tracking-wider" 
                           style={{ color: "white", textShadow: `0 0 30px ${lastSpeech.role === "assistant" ? themeColor : "white"}, 0 0 10px white` }}>
                            "{lastSpeech.text}"
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Futuristic Reactor Toggle Button */}
            <button
                onClick={handleMicToggle}
                className="pointer-events-auto px-16 sm:px-24 py-5 uppercase tracking-[0.4em] font-black text-sm sm:text-lg transition-all duration-500 relative overflow-hidden group"
                style={{
                    color: micEnabled ? "#000" : "white",
                    backgroundColor: micEnabled ? themeColor : "transparent",
                    border: `2px solid ${themeColor}`,
                    boxShadow: micEnabled ? `0 0 50px ${themeColor}, inset 0 0 30px ${themeColor}` : `0 0 20px ${themeColor}22`
                }}
            >
                {/* Tech background element */}
                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity" />
                <div className="absolute top-0 left-0 w-4 h-4 border-b-2 border-r-2" style={{ borderColor: micEnabled ? "#000" : themeColor }} />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-t-2 border-l-2" style={{ borderColor: micEnabled ? "#000" : themeColor }} />
                
                {micEnabled ? "CANAL ABERTO" : "INICIAR CONEXÃO"}
            </button>
        </footer>
      </div>
    </div>
  );
}
