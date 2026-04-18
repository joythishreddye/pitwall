"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { DrawPath } from "@/components/ui/draw-path";
import { circuitPaths, getCircuitMeta } from "@/lib/constants/circuits";
import { getTeamColor } from "@/lib/constants/teams";
import { useCountdown } from "@/lib/hooks/use-countdown";
import type { RaceCalendarItem } from "@/lib/schemas/races";

interface RaceCardProps {
  race: RaceCalendarItem;
  isNext: boolean;
  /** Card index — used to stagger the circuit draw animation for above-fold cards */
  index: number;
}

export function RaceCard({ race, isNext, index }: RaceCardProps) {
  const now = new Date();
  const raceDate = race.date ? new Date(race.date + "T00:00:00") : null;
  const isPast = raceDate ? raceDate < now : false;

  const countdown = useCountdown(isNext && race.date ? race.date : undefined);

  const circuitMeta = getCircuitMeta(race.circuit.name);
  const circuitPath = circuitMeta ? circuitPaths[circuitMeta.key] : null;

  const winnerTeamColor = race.winner
    ? getTeamColor(race.winner.constructor_ref)
    : null;

  const roundLabel = `R${String(race.round).padStart(2, "0")}`;

  const formattedDate = raceDate
    ? raceDate.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    : "TBC";

  // Above-fold cards (0-5): mount trigger with staggered delay so user sees the cascade.
  // Below-fold cards: scroll trigger fires when entering viewport.
  const aboveFold = index < 6;
  const drawDelay = aboveFold ? index * 0.3 : 0;
  const drawTrigger = aboveFold ? "mount" : "scroll";

  return (
    <Link
      href={`/races/${race.id}`}
      className={cn(
        "race-card relative flex flex-col min-h-52 p-4 border transition-colors duration-100 hover:bg-f1-dark-3 cursor-pointer overflow-hidden",
        isNext ? "bg-f1-dark-2 border-f1-cyan" : "bg-f1-dark-2 border-f1-grid",
        isPast && "opacity-85"
      )}
    >
      {/* Circuit SVG — absolute background, outlined double-stroke road-edge style */}
      {circuitPath && (
        <DrawPath
          d={circuitPath.d}
          viewBox={circuitPath.viewBox}
          color="var(--color-f1-cyan)"
          strokeWidth={4}
          outlined
          duration={1.8}
          trigger={drawTrigger}
          delay={drawDelay}
          className="absolute inset-0 left-[30%] opacity-[0.20] pointer-events-none"
        />
      )}

      {/* Top row: round + state badge */}
      <div className="relative flex items-center justify-between mb-4">
        <span className="font-data text-xs text-f1-muted">{roundLabel}</span>
        {isNext && (
          <span className="text-[10px] font-semibold uppercase tracking-widest text-f1-cyan border border-f1-cyan px-1.5 py-0.5">
            UPCOMING
          </span>
        )}
        {isPast && !isNext && (
          <span className="text-[10px] uppercase tracking-wider text-f1-muted">
            COMPLETED
          </span>
        )}
      </div>

      {/* Content — pushed to bottom of card */}
      <div className="relative mt-auto">
        {/* Country (hero label) */}
        <p
          className={cn(
            "text-xl font-semibold tracking-tight uppercase leading-tight",
            isPast ? "text-f1-muted" : "text-f1-text"
          )}
        >
          {race.circuit.country ?? race.circuit.name}
        </p>

        {/* Circuit name + race name */}
        <p className="text-xs text-f1-muted mt-0.5 leading-snug">{race.circuit.name}</p>
        <p className="text-xs text-f1-muted leading-snug">{race.name}</p>

        {/* Date + location */}
        <p className="font-data text-xs text-f1-muted mt-2">
          {formattedDate}
          {race.circuit.location ? ` · ${race.circuit.location}` : ""}
        </p>

        {/* Countdown — next race only */}
        {isNext && countdown && (
          <div className="font-data text-base text-f1-cyan mt-2 tabular-nums tracking-tight">
            {countdown.days > 0 && <span>{countdown.days}d </span>}
            {String(countdown.hours).padStart(2, "0")}:
            {String(countdown.minutes).padStart(2, "0")}:
            {String(countdown.seconds).padStart(2, "0")}
          </div>
        )}

        {/* Winner badge — bottom-right, completed races only */}
        {isPast && race.winner && (
          <div className="flex items-center gap-1.5 mt-2">
            <div
              className="w-0.5 h-3.5 shrink-0"
              style={{ backgroundColor: winnerTeamColor ?? "#A3A3A3" }}
              aria-hidden="true"
            />
            <span className="text-xs text-f1-muted">
              <span className="text-f1-text font-medium">{race.winner.surname}</span>
              {" · "}
              <span className="text-f1-muted">{race.winner.constructor_name}</span>
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
