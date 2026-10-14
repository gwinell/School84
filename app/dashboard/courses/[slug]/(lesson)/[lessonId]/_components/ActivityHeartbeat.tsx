"use client";

import { useEffect } from "react";

const HEARTBEAT_MS = 20_000;
const IDLE_LIMIT_MS = 60_000;

export function ActivityHeartbeat({
  cellId,
  kind,
}: {
  cellId: string;
  kind: "READING" | "SOLVING";
}) {
  useEffect(() => {
    let lastInteraction = Date.now();
    let lastSent = lastInteraction;

    const interact = () => {
      lastInteraction = Date.now();
    };

    const visibility = () => {
      if (document.visibilityState === "visible") {
        lastInteraction = Date.now();
        lastSent = lastInteraction;
      } else {
        lastSent = Date.now();
      }
    };

    const sendHeartbeat = () => {
      const now = Date.now();
      if (document.visibilityState !== "visible" || now - lastInteraction > IDLE_LIMIT_MS) {
        lastSent = now;
        return;
      }

      const activeStart = Math.max(lastSent, lastInteraction);
      const seconds = Math.min(20, Math.floor((now - activeStart) / 1_000));
      lastSent = now;
      if (seconds <= 0) return;

      void fetch("/api/learning/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId: crypto.randomUUID(),
          cellId,
          kind,
          seconds,
        }),
        keepalive: true,
      }).catch(() => undefined);
    };

    const events = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"] as const;
    events.forEach((event) => window.addEventListener(event, interact, { passive: true }));
    document.addEventListener("visibilitychange", visibility);
    const interval = window.setInterval(sendHeartbeat, HEARTBEAT_MS);

    return () => {
      window.clearInterval(interval);
      events.forEach((event) => window.removeEventListener(event, interact));
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [cellId, kind]);

  return null;
}
