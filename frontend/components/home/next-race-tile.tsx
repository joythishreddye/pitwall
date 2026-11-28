"use client";

import { Calendar } from "lucide-react";
import { StatusDot } from "@/components/ui/status-dot";
import { DrawPath } from "@/components/ui/draw-path";
import { raceStart, useCountdown } from "@/lib/hooks/use-countdown";
import { getCircuitMeta, circuitPaths } from "@/lib/constants/circuits";
import type { RaceCalendarItem } from "@/lib/schemas/races";

interface NextRaceTileProps {
  race: RaceCalendarItem;
  revealed?: boolean;
}

export function NextRaceTile({ race, revealed = false }: NextRaceTileProps) {
  const countdown = useCountdown(race.date ?? undefined, race.time);
  const circuitMeta = getCircuitMeta(race.circuit.name);
  const circuitKey = circuitMeta?.key;

  // Race day is the day the race starts in the reader's zone: in Tokyo, Qatar's 16:00Z Sunday start is Monday.
  const isToday = (() => {
    if (!race.date) return false;
    const start = new Date(raceStart(race.date, race.time));
    return start.toDateString() === new Date().toDateString();
  })();

  const track = circuitKey ? circuitPaths[circuitKey] : undefined;

  return (
    // The tile's own width decides the layout (it's half the grid from 768 px, so a 768 screen gives the narrowest tile)
    <div className="@container relative overflow-hidden bg-f1-dark-2 border border-f1-grid h-full">
      <div className="p-5 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-f1-green" />
            <span className="text-xs text-f1-muted uppercase tracking-widest">Next Race</span>
          </div>
          {isToday ? (
            <div className="flex items-center gap-1.5">
              <StatusDot variant="live" />
              <span className="text-xs font-data text-f1-green">RACE DAY</span>
            </div>
          ) : (
            <span className="font-data text-xs text-f1-muted">Round {race.round}</span>
          )}
        </div>

        {/* The race and its countdown; from a 320 px tile the track gets its own column beside them, never under the text */}
        <div className="grid grid-cols-1 @xs:grid-cols-[minmax(min-content,max-content)_minmax(5rem,1fr)] @xs:gap-x-4">
          <div className="flex min-w-0 flex-col gap-3">
            {/* Race name */}
            <div>
              <p className="font-heading text-lg font-semibold text-f1-text leading-tight">{race.name}</p>
              <p className="text-xs text-f1-muted mt-0.5">{race.circuit.name} — {race.circuit.country}</p>
            </div>

            {/* Live countdown */}
            {countdown !== null ? (
              <div role="timer" aria-label="Time to the race" className="flex items-center gap-1">
                <CountdownSegment value={countdown.days} label="D" />
                <span className="font-data text-f1-muted text-lg font-bold">:</span>
                <CountdownSegment value={countdown.hours} label="H" />
                <span className="font-data text-f1-muted text-lg font-bold">:</span>
                <CountdownSegment value={countdown.minutes} label="M" />
                <span className="font-data text-f1-muted text-lg font-bold">:</span>
                <CountdownSegment value={countdown.seconds} label="S" />
              </div>
            ) : (
              <div role="timer" aria-label="Time to the race" className="flex items-center gap-1">
                {["D", "H", "M", "S"].map((l) => (
                  <CountdownSegment key={l} value={0} label={l} />
                ))}
              </div>
            )}

            {/* Race date */}
            <p className="font-data text-xs text-f1-muted">{race.date}</p>
          </div>

          {/* DrawPath circuit, outlined road-edge style, right-aligned in its column (it adds no height). Its top stays at
              the column's, below the header's Round label; it may run down into the tile's bottom padding */}
          {track && (
            <div
              className="relative hidden @xs:block opacity-[0.28] pointer-events-none"
              aria-hidden="true"
              data-testid="next-race-outline"
            >
              <DrawPath
                d={track.d}
                viewBox={track.viewBox}
                color="var(--color-f1-cyan)"
                strokeWidth={5}
                outlined
                duration={2.5}
                delay={0.15}
                paused={!revealed}
                className="absolute right-0 top-0 h-[calc(100%+1.25rem)] w-auto max-w-full"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CountdownSegment({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-data text-2xl font-bold text-f1-text tabular-nums w-8 lg:w-10 text-center">
        {String(value).padStart(2, "0")}
      </span>
      <span className="font-data text-[11px] text-f1-muted uppercase tracking-widest">{label}</span>
    </div>
  );
}
