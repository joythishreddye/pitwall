"use client";

import { useState, useEffect } from "react";

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Returns a live countdown to the given ISO date string (YYYY-MM-DD).
 * Updates every second. Returns null until mounted (SSR-safe).
 */
export function useCountdown(targetDate: string | undefined): Countdown | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!targetDate) return;
    const target = new Date(targetDate + "T00:00:00").getTime();

    const tick = () => {
      const diff = target - Date.now();
      setRemaining(Math.max(0, diff));
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (remaining === null) return null;

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}
