"use client";

import { useRef } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { getTeamColor } from "@/lib/constants/teams";
import { formatRaceTime, formatGap, formatLapsDown, positionColor } from "@/lib/format";
import type { RaceResult } from "@/lib/schemas/races";

// One column layout for the header and the rows. Phones get five columns (the team moves under the driver's
// name, and the fastest lap shows after the team); from 1024 px, the full seven (at 768 the sidebar leaves too little
// room). The phone Gap column fits the winner's race time ("1:35:23.504") and "Disqualified" (about 86 px in the
// 12 px mono); a status of several words, such as "Did not start", wraps onto a second line.
const COLUMNS =
  "grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem_2.25rem_5.5rem] gap-x-1.5 px-3 lg:grid-cols-[3rem_2fr_1fr_3.5rem_4rem_6rem_5rem] lg:gap-x-4 lg:px-4";

interface RaceResultsTableProps {
  results: RaceResult[];
  winnerMs: number | null;
}

export function RaceResultsTable({ results, winnerMs }: RaceResultsTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (respectsReducedMotion()) return;
      gsap.from(".result-row", {
        opacity: 0,
        x: -8,
        stagger: 0.025,
        duration: 0.3,
        ease: "pitwall-accel",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 85%",
          once: true,
        },
      });
    },
    { scope: containerRef, dependencies: [results] }
  );

  return (
    <div ref={containerRef} className="w-full">
      <div
        className={cn(
          COLUMNS,
          "sticky top-0 z-10 py-2 text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark"
        )}
      >
        <span>Pos</span>
        <span>Driver</span>
        <span className="hidden lg:block">Team</span>
        <span className="text-right">Grid</span>
        <span className="text-right">Pts</span>
        <span className="text-right">Gap</span>
        <span className="hidden lg:block text-right">FL</span>
      </div>

      {(() => {
        const winnerLaps = results[0]?.laps ?? null;
        return results.map((r, i) => {
        const teamColor = getTeamColor(r.constructor.ref);
        const grid = r.grid ?? 0;
        // position_text is numeric ("1"-"20") for classified, "R"/"W"/"D" for non-classified
        const isClassified =
          r.position_text != null && /^\d+$/.test(r.position_text);
        const isDnf = !isClassified;
        const isLapped = isClassified && r.status === "Lapped";
        const pos = r.position ?? 0;
        const gridDelta = pos > 0 && !isDnf ? grid - pos : 0;
        const isFl = r.fastest_lap_rank === 1;

        return (
          <Link
            key={r.driver.ref}
            href={`/drivers/${r.driver.ref}`}
            className={cn(
              COLUMNS,
              "result-row items-center min-h-11 py-1 lg:py-0 text-sm border-b border-f1-grid/50 transition-colors duration-100 hover:bg-f1-dark-3",
              i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3"
            )}
          >
            {/* Position */}
            <span
              className={cn(
                "font-data text-base font-bold",
                isDnf ? "text-f1-red" : positionColor(r.position)
              )}
            >
              {isDnf ? (
                <span className="flex items-center gap-1">
                  <AlertTriangle size={14} aria-hidden="true" className="hidden lg:block" />
                  <span>DNF</span>
                </span>
              ) : (
                r.position
              )}
            </span>

            {/* Driver */}
            <div className="result-driver flex items-center gap-2 lg:gap-3 min-w-0">
              <div
                className="w-1 h-5 shrink-0"
                style={{ backgroundColor: teamColor }}
                aria-hidden="true"
              />
              <span className="min-w-0">
                {/* The name has the cell's whole width (it shortens only on the narrowest phones) */}
                <span className="result-name block truncate">
                  <span className="hidden lg:inline text-f1-muted">{r.driver.forename} </span>
                  <span className="font-semibold uppercase">{r.driver.surname}</span>
                </span>
                {/* On phones the team sits under the name, with the fastest lap badge after it: the team shortens,
                    the badge never does */}
                <span className="lg:hidden flex items-center gap-1.5 min-w-0 text-xs text-f1-muted">
                  <span className="truncate">{r.constructor.name}</span>
                  {isFl && (
                    <span
                      className="shrink-0 rounded-sm bg-f1-purple px-1 font-data text-[11px] font-bold leading-4 text-f1-dark"
                      aria-label="Fastest lap"
                    >
                      FL
                    </span>
                  )}
                </span>
              </span>
            </div>

            {/* Team */}
            <span className="hidden lg:block text-f1-muted text-xs truncate">{r.constructor.name}</span>

            {/* Grid position + delta */}
            <div className="text-right flex items-center justify-end gap-1">
              <span className="font-data text-f1-muted">{r.grid ?? "—"}</span>
              {gridDelta !== 0 && !isDnf && (
                <span
                  className={cn(
                    "hidden lg:inline text-[11px] font-data",
                    gridDelta > 0 ? "text-f1-green" : "text-f1-red-text"
                  )}
                >
                  {gridDelta > 0 ? `+${gridDelta}` : gridDelta}
                </span>
              )}
            </div>

            {/* Points */}
            <span className="text-right font-data font-semibold">
              {(r.points ?? 0) > 0 ? Math.floor(r.points!) : "—"}
            </span>

            {/* Gap */}
            <span className="result-gap text-right font-data text-xs text-f1-muted">
              {r.position === 1
                ? formatRaceTime(r.time_millis)
                : isLapped
                ? formatLapsDown(r.laps, winnerLaps)
                : formatGap(r.time_millis, winnerMs, r.status)}
            </span>

            {/* Fastest lap — purple glow */}
            <span
              className={cn(
                "hidden lg:block text-right font-data text-xs",
                isFl ? "text-purple-400" : "text-f1-muted"
              )}
              style={isFl ? { textShadow: "0 0 8px var(--color-f1-purple)" } : undefined}
              aria-label={isFl ? "Fastest lap" : undefined}
            >
              {isFl ? "FL" : "—"}
            </span>
          </Link>
        );
        });
      })()}
    </div>
  );
}
