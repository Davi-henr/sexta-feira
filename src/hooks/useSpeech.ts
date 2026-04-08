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

  useEffect(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const hasSynth = "speechSynthesis" in window;

    if (SpeechRecognitionAPI && hasSynth) {
      setIsSupported(true);
      synthRef.current = window.speechSynthesis;
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
      utterance.lang = lang;
      utterance.rate = 1.05;
      utterance.pitch = 0.8; // Pitch um pouco mais grave, suave
      utterance.volume = 1.0;

      // Preferir voz masculina formal, "Google" ou "Microsoft Daniel"
      const voices = synthRef.current.getVoices();
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith("pt") &&
          (v.name.includes("Daniel") || v.name.includes("Google") || v.name.includes("Microsoft"))
      );
      if (preferred) {
        utterance.voice = preferred;
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
