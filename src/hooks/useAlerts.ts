"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DBAlert } from "@/lib/supabase";

interface UseAlertsOptions {
  onAlertTriggered: (alert: DBAlert) => void;
  pollIntervalMs?: number; // Fallback polling interval (default: 15s)
}

/**
 * useAlerts — Real-time alert monitoring
 *
 * Uses Supabase Realtime as the primary mechanism.
 * Falls back to polling if Realtime is unavailable.
 */
export function useAlerts({ onAlertTriggered, pollIntervalMs = 15_000 }: UseAlertsOptions) {
  const [activeAlerts, setActiveAlerts] = useState<DBAlert[]>([]);
  const dismissedRef = useRef<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch triggered alerts ────────────────────────────────────────────────

  const onAlertTriggeredRef = useRef(onAlertTriggered);
  useEffect(() => {
    onAlertTriggeredRef.current = onAlertTriggered;
  }, [onAlertTriggered]);

  const fetchTriggered = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      if (!res.ok) return;
      const data = await res.json();
      const alerts: DBAlert[] = data.alerts ?? [];

      // Only notify for new alerts not yet dismissed
      alerts.forEach((alert) => {
        if (!dismissedRef.current.has(alert.id)) {
          onAlertTriggeredRef.current(alert);
          dismissedRef.current.add(alert.id); // Don't notify twice
        }
      });
    } catch (err) {
      console.error("[useAlerts] Poll error:", err);
    }
  }, []);

  // ── Dismiss an alert ──────────────────────────────────────────────────────

  const dismissAlert = useCallback(async (alertId: string) => {
    dismissedRef.current.add(alertId);
    setActiveAlerts((prev) => prev.filter((a) => a.id !== alertId));

    try {
      await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId }),
      });
    } catch (err) {
      console.error("[useAlerts] Dismiss error:", err);
    }
  }, []);

  // ── Supabase Realtime subscription ───────────────────────────────────────

  useEffect(() => {
    // Initial fetch
    fetchTriggered();

    // Realtime: listen for alert status changes to 'triggered'
    const channel = supabase
      .channel("alerts-realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "alerts",
          filter: "status=eq.triggered",
        },
        (payload) => {
          const alert = payload.new as DBAlert;
          if (!dismissedRef.current.has(alert.id)) {
            onAlertTriggeredRef.current(alert);
            setActiveAlerts((prev) => {
              if (prev.find((a) => a.id === alert.id)) return prev;
              return [alert, ...prev];
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[useAlerts] Realtime connected");
        } else if (status === "CHANNEL_ERROR") {
          // Realtime unavailable — fall back to polling
          console.warn("[useAlerts] Realtime failed, falling back to polling");
          if (!pollRef.current) {
            pollRef.current = setInterval(fetchTriggered, pollIntervalMs);
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchTriggered, pollIntervalMs]);

  return { activeAlerts, dismissAlert };
}
