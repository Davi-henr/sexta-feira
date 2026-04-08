"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechState = "idle" | "listening" | "processing" | "speaking";

interface UseSpeechOptions {
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
  lang?: string;
}

export function useSpeech({ onTranscript, onError, lang = "pt-BR" }: UseSpeechOptions) {
  const [state, setState] = useState<SpeechState>("idle");
  const [isSupported, setIsSupported] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [volume, setVolume] = useState(0); // 0-1 audio level

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false); // Prevent echo: don't listen while speaking

  // ── Initialize ─────────────────────────────────────────────────────────────

  const bestVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const hasSynth = "speechSynthesis" in window;

    if (SpeechRecognitionAPI && hasSynth) {
      setIsSupported(true);
      synthRef.current = window.speechSynthesis;

      // Pick best voice whenever voices load (async on Chrome)
      const pickBestVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        console.log("[TTS] Voices loaded:", voices.length, voices.map(v => `${v.name} (${v.lang})`).join(", "));
        
        if (voices.length === 0) return;

        // Score each voice — high score = best match for masculine pt-BR
        let best: SpeechSynthesisVoice | null = null;
        let bestScore = -999;

        for (const v of voices) {
          let score = 0;
          const n = v.name.toLowerCase();

          // Language bonuses
          if (v.lang === "pt-BR") score += 15;
          else if (v.lang.startsWith("pt")) score += 8;
          
          // Known masculine voice names (Windows/Chrome)
          if (n.includes("daniel")) score += 25;
          if (n.includes("antonio")) score += 25;
          if (n.includes("arthur")) score += 20;
          if (n.includes("felipe")) score += 20;

          // Kill female voices hard
          if (n.includes("francisca")) score = -100;
          if (n.includes("luciana")) score = -100;
          if (n.includes("maria")) score = -100;
          if (n.includes("sonia")) score = -100;
          if (n.includes("zira")) score = -100;
          if (n.includes("aria")) score = -100;
          if (n.includes("jenny")) score = -100;

          // Prefer Microsoft Online (Neural) voices when available — they sound human
          if (n.includes("online") || n.includes("neural")) score += 10;
          // Google voices are OK  
          if (n.includes("google") && v.lang.startsWith("pt")) score += 5;

          if (score > bestScore) {
            bestScore = score;
            best = v;
          }
        }

        if (best) {
          bestVoiceRef.current = best;
          console.log("[TTS] ✅ Selected voice:", best.name, `(${best.lang})`, "score:", bestScore);
        }
      };

      pickBestVoice();
      window.speechSynthesis.addEventListener("voiceschanged", pickBestVoice);
    }

    return () => {
      stopListening();
      stopVolumeMonitor();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Volume Monitor (via Web Audio API) ────────────────────────────────────

  const startVolumeMonitor = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const tick = () => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setVolume(avg / 128); // Normalize to 0-1
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Microphone permission denied — handled gracefully
    }
  }, []);

  const stopVolumeMonitor = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    audioContextRef.current?.close();
    setVolume(0);
  }, []);

  // ── Speech Recognition ─────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (!isSupported || isSpeakingRef.current) return;

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setState("listening");
      setIsMicActive(true);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      
      // Ignorar alucinações de ruído de fundo comuns na Web Speech API em português
      const lower = transcript.toLowerCase().replace(/[^a-zê]/g, '');
      if (lower === "silncio" || lower === "silencio" || lower === "") {
        return;
      }

      if (transcript) {
        setState("processing");
        onTranscript(transcript);
      }
    };

    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        onError?.(`Erro de reconhecimento: ${event.error}`);
      }
      setState("idle");
      setIsMicActive(false);
    };

    recognition.onend = () => {
      setIsMicActive(false);
      if (state !== "processing" && state !== "speaking") {
        setState("idle");
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setState("idle");
    }
  }, [isSupported, lang, onTranscript, onError, state]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setState("idle");
    setIsMicActive(false);
  }, []);

  // ── Text-to-Speech ─────────────────────────────────────────────────────────

  const speak = useCallback(
    (text: string, onDone?: () => void) => {
      if (!synthRef.current || !text.trim()) {
        onDone?.();
        return;
      }

      // Cancel any ongoing speech
      synthRef.current.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "pt-BR";
      utterance.rate = 1.0;
      utterance.pitch = 0.8;
      utterance.volume = 1.0;

      // Use the pre-cached best masculine voice
      if (bestVoiceRef.current) {
        utterance.voice = bestVoiceRef.current;
        console.log("[TTS] Speaking with:", bestVoiceRef.current.name);
      } else {
        console.warn("[TTS] No cached voice available, using browser default");
      }

      utterance.onstart = () => {
        isSpeakingRef.current = true;
        setState("speaking");
      };

      utterance.onend = () => {
        isSpeakingRef.current = false;
        setState("idle");
        onDone?.();
      };

      utterance.onerror = () => {
        isSpeakingRef.current = false;
        setState("idle");
        onDone?.();
      };

      utteranceRef.current = utterance;
      synthRef.current.speak(utterance);
    },
    [lang]
  );

  const cancelSpeech = useCallback(() => {
    synthRef.current?.cancel();
    isSpeakingRef.current = false;
    setState("idle");
  }, []);

  // ── Toggle mic (continuous listening mode) ─────────────────────────────────

  const toggleMic = useCallback(async () => {
    if (isMicActive) {
      stopListening();
      stopVolumeMonitor();
    } else {
      await startVolumeMonitor();
      startListening();
    }
  }, [isMicActive, startListening, stopListening, startVolumeMonitor, stopVolumeMonitor]);

  return {
    state,
    isMicActive,
    isSupported,
    volume,
    speak,
    cancelSpeech,
    startListening,
    stopListening,
    toggleMic,
    setState,
  };
}

// ── Type augmentation for vendor-prefixed API ──────────────────────────────

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}
