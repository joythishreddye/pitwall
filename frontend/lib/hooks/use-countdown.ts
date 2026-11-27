"use client";

import { useState, useEffect } from "react";

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * When a race starts, in milliseconds since the epoch. The API sends Jolpica's start time in UTC,
 * without a zone ("16:00:00"), so it's read as UTC, never as the reader's local time. A race with
 * no time counts to the start of its day in the reader's zone, as before.
 */
export function raceStart(date: string, time?: string | null): number {
  if (!time) return new Date(`${date}T00:00:00`).getTime();
  const zoned = /(Z|[+-]\d{2}:?\d{2})$/.test(time) ? time : `${time}Z`;
  return new Date(`${date}T${zoned}`).getTime();
}

/**
 * Returns a live countdown to a race's start: its ISO date (YYYY-MM-DD) and its UTC start time,
 * when there is one. Updates every second. Returns null until mounted (SSR-safe).
 */
export function useCountdown(
  targetDate: string | undefined,
  targetTime?: string | null,
): Countdown | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!targetDate) return;
    const target = raceStart(targetDate, targetTime);

    const tick = () => {
      const diff = target - Date.now();
      setRemaining(Math.max(0, diff));
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate, targetTime]);

  if (remaining === null) return null;

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}
