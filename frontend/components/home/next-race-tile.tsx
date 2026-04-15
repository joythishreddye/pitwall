"use client";

import { Calendar } from "lucide-react";
import { StatusDot } from "@/components/ui/status-dot";
import { useCountdown } from "@/lib/hooks/use-countdown";
import { getCircuitMeta } from "@/lib/constants/circuits";
import type { RaceCalendarItem } from "@/lib/schemas/races";

interface NextRaceTileProps {
  race: RaceCalendarItem;
}

export function NextRaceTile({ race }: NextRaceTileProps) {
  const countdown = useCountdown(race.date ?? undefined);
  const circuitMeta = getCircuitMeta(race.circuit.name);
  const circuitKey = circuitMeta?.key;

  const isToday = (() => {
    if (!race.date) return false;
    const d = new Date(race.date + "T00:00:00");
    const now = new Date();
    return d.toDateString() === now.toDateString();
  })();

  return (
    <div className="relative overflow-hidden bg-f1-dark-2 border border-f1-grid h-full">
      {/* Circuit SVG ambient background */}
      {circuitKey && (
        <img
          src={`/circuits/${circuitKey}.svg`}
          alt=""
          aria-hidden="true"
          className="absolute right-0 bottom-0 h-[130%] w-auto pointer-events-none select-none"
          style={{ opacity: 0.06, transform: "translate(15%, 15%)" }}
        />
      )}

      {/* Content */}
      <div className="relative z-[5] p-5 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-f1-green" />
            <span className="text-xs text-f1-muted uppercase tracking-widest">Next Race</span>
          </div>
          {isToday ? (
            <div className="flex items-center gap-1.5">
              <StatusDot variant="live" pulse />
              <span className="text-xs font-data text-f1-green">RACE DAY</span>
            </div>
          ) : (
            <span className="font-data text-xs text-f1-muted">Round {race.round}</span>
          )}
        </div>

        {/* Race name */}
        <div>
          <p className="font-heading text-lg font-semibold text-f1-text leading-tight">{race.name}</p>
          <p className="text-xs text-f1-muted mt-0.5">{race.circuit.name} — {race.circuit.country}</p>
        </div>

        {/* Live countdown */}
        {countdown !== null ? (
          <div className="flex items-center gap-1">
            <CountdownSegment value={countdown.days} label="D" />
            <span className="font-data text-f1-muted text-lg font-bold">:</span>
            <CountdownSegment value={countdown.hours} label="H" />
            <span className="font-data text-f1-muted text-lg font-bold">:</span>
            <CountdownSegment value={countdown.minutes} label="M" />
            <span className="font-data text-f1-muted text-lg font-bold">:</span>
            <CountdownSegment value={countdown.seconds} label="S" />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {["D", "H", "M", "S"].map((l) => (
              <CountdownSegment key={l} value={0} label={l} />
            ))}
          </div>
        )}

        {/* Race date */}
        <p className="font-data text-xs text-f1-muted">{race.date}</p>
      </div>
    </div>
  );
}

function CountdownSegment({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-data text-2xl font-bold text-f1-text tabular-nums w-10 text-center">
        {String(value).padStart(2, "0")}
      </span>
      <span className="font-data text-[9px] text-f1-muted uppercase tracking-widest">{label}</span>
    </div>
  );
}
