"use client";

import { useCallback, useEffect, useRef } from "react";

interface UseProactiveOptions {
  conversationId: string | null;
  silenceThresholdMs?: number; // Default: 5 minutes
  enabled?: boolean;
  onProactiveMessage: (message: string, conversationId: string) => void;
  isActive: boolean; // True when mic is active or Sexta-feira is speaking
}

/**
 * useProactive — Silence Detection + Proactive Trigger
 *
 * Watches for extended periods of silence (no user interaction)
 * and triggers Sexta-feira to initiate a new topic.
 */
export function useProactive({
  conversationId,
  silenceThresholdMs = 5 * 60 * 1000, // 5 minutes
  enabled = true,
  onProactiveMessage,
  isActive,
}: UseProactiveOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const isFetchingRef = useRef(false);

  const resetSilenceTimer = useCallback(() => {
    lastActivityRef.current = Date.now();

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (!enabled) return;

    timerRef.current = setTimeout(async () => {
      // Don't trigger if already processing or if not idle
      if (isFetchingRef.current || isActive) return;

      isFetchingRef.current = true;
      try {
        const res = await fetch("/api/proactive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.reply) {
            onProactiveMessage(data.reply, data.conversationId ?? conversationId);
          }
        }
      } catch (err) {
        console.error("[useProactive] Error fetching proactive message:", err);
      } finally {
        isFetchingRef.current = false;
        // Reset timer for next proactive trigger
        resetSilenceTimer();
      }
    }, silenceThresholdMs);
  }, [enabled, conversationId, silenceThresholdMs, onProactiveMessage, isActive]);

  // Start the timer when enabled
  useEffect(() => {
    if (enabled) {
      resetSilenceTimer();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, resetSilenceTimer]);

  // Reset whenever isActive changes (e.g., user spoke or Sexta-feira replied)
  useEffect(() => {
    if (isActive) {
      resetSilenceTimer();
    }
  }, [isActive, resetSilenceTimer]);

  return { resetSilenceTimer };
}
