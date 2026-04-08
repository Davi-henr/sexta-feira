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
      utterance.lang = "pt-BR";
      utterance.rate = 1.0;
      utterance.pitch = 0.8;
      utterance.volume = 1.0;

      // Smart masculine voice picker: score voices and pick best male
      const voices = synthRef.current.getVoices();
      
      // Log available voices for debugging (see browser console)
      console.log("[TTS] Available voices:", voices.map(v => `${v.name} (${v.lang})`).join(", "));

      const scoredVoices = voices.map(v => {
        let score = 0;
        const nameLower = v.name.toLowerCase();
        // Prefer pt-BR voices
        if (v.lang === "pt-BR") score += 10;
        if (v.lang.startsWith("pt")) score += 5;
        // Prefer known masculine names
        if (nameLower.includes("daniel")) score += 20;
        if (nameLower.includes("arthur")) score += 15;
        if (nameLower.includes("felipe")) score += 15;
        if (nameLower.includes("reed")) score += 12;
        if (nameLower.includes("guy")) score += 12;
        if (nameLower.includes("ryan")) score += 10;
        // Downrank known female voices
        if (nameLower.includes("francisca")) score -= 50;
        if (nameLower.includes("luciana")) score -= 50;
        if (nameLower.includes("sonia")) score -= 50;
        if (nameLower.includes("zira")) score -= 50;
        if (nameLower.includes("aria")) score -= 50;
        // Prefer Microsoft Neural voices when available
        if (nameLower.includes("microsoft") && nameLower.includes("neural")) score += 8;
        if (nameLower.includes("google")) score += 3;
        return { voice: v, score };
      });

      scoredVoices.sort((a, b) => b.score - a.score);
      const bestVoice = scoredVoices[0];
      
      if (bestVoice && bestVoice.score > 0) {
        utterance.voice = bestVoice.voice;
        // If we had to fall back to english voice, keep pt-BR lang for pronunciation tone
        if (!bestVoice.voice.lang.startsWith("pt")) {
          utterance.lang = "pt-BR"; 
        }
        console.log("[TTS] Using voice:", bestVoice.voice.name, "score:", bestVoice.score);
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
