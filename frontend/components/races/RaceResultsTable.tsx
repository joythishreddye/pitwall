"use client";

import { useRef } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { getTeamColor } from "@/lib/constants/teams";
import { formatLapTime, formatGap, positionColor } from "@/lib/format";
import type { RaceResult } from "@/lib/schemas/races";

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
      <div className="sticky top-0 z-10 grid grid-cols-[3rem_2fr_1fr_3.5rem_4rem_6rem_5rem] gap-x-4 px-4 py-2 text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark">
        <span>Pos</span>
        <span>Driver</span>
        <span>Team</span>
        <span className="text-right">Grid</span>
        <span className="text-right">Pts</span>
        <span className="text-right">Gap</span>
        <span className="text-right">FL</span>
      </div>

      {results.map((r, i) => {
        const teamColor = getTeamColor(r.constructor.ref);
        const grid = r.grid ?? 0;
        const pos = r.position ?? 0;
        const gridDelta = pos > 0 ? grid - pos : 0;
        const isDnf =
          r.position == null ||
          r.status === "Retired" ||
          (r.status && r.status !== "Finished" && !r.status.startsWith("+"));
        const isFl = r.fastest_lap_rank === 1;

        return (
          <Link
            key={r.driver.ref}
            href={`/drivers/${r.driver.ref}`}
            className={cn(
              "result-row grid grid-cols-[3rem_2fr_1fr_3.5rem_4rem_6rem_5rem] gap-x-4 items-center px-4 h-11 text-sm border-b border-f1-grid/50 transition-colors duration-100 hover:bg-f1-dark-3",
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
                  <AlertTriangle size={14} aria-hidden="true" />
                  <span>DNF</span>
                </span>
              ) : (
                r.position
              )}
            </span>

            {/* Driver */}
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-1 h-5 shrink-0"
                style={{ backgroundColor: teamColor }}
                aria-hidden="true"
              />
              <span className="truncate">
                <span className="text-f1-muted">{r.driver.forename} </span>
                <span className="font-semibold uppercase">{r.driver.surname}</span>
              </span>
            </div>

            {/* Team */}
            <span className="text-f1-muted text-xs truncate">{r.constructor.name}</span>

            {/* Grid position + delta */}
            <div className="text-right flex items-center justify-end gap-1">
              <span className="font-data text-f1-muted">{r.grid ?? "—"}</span>
              {gridDelta !== 0 && !isDnf && (
                <span
                  className={cn(
                    "text-[10px] font-data",
                    gridDelta > 0 ? "text-f1-green" : "text-f1-red"
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
            <span className="text-right font-data text-xs text-f1-muted">
              {r.position === 1
                ? formatLapTime(r.time_millis)
                : formatGap(r.time_millis, winnerMs, r.status)}
            </span>

            {/* Fastest lap — purple glow */}
            <span
              className={cn(
                "text-right font-data text-xs",
                isFl ? "text-purple-400" : "text-f1-muted"
              )}
              style={isFl ? { textShadow: "0 0 8px #A855F7" } : undefined}
              aria-label={isFl ? "Fastest lap" : undefined}
            >
              {isFl ? "FL" : "—"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
