"use client";

import { useRef } from "react";
import Link from "next/link";
import { gsap, useGSAP, ScrollTrigger, respectsReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { formatPoints, positionColor } from "@/lib/format";
import type { DriverResult } from "@/lib/schemas/drivers";

void ScrollTrigger;

// One column layout for the header and the rows. Below 1024 px (a phone, or 768 beside the sidebar) five columns
// with narrow gaps: the date moves under the race's name, so the name keeps room. From 1024 px, the full six.
// Before, the six columns needed about 440 px, so on a 390 px phone the names shrank to nothing and the points
// ran off the screen.
const COLUMNS =
  "grid grid-cols-[2rem_minmax(0,1fr)_2.25rem_3rem_2.5rem] gap-x-2 px-3 lg:grid-cols-[3rem_minmax(0,1fr)_7rem_3.5rem_3rem_4rem] lg:gap-x-4 lg:px-4";

interface SeasonResultsTableProps {
  results: DriverResult[];
  season: number;
}

export function SeasonResultsTable({ results, season }: SeasonResultsTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!tableRef.current || results.length === 0) return;
      if (respectsReducedMotion()) return;
      gsap.from(".result-row", {
        opacity: 0,
        x: -8,
        stagger: 0.025,
        duration: 0.3,
        ease: "pitwall-accel",
        scrollTrigger: {
          trigger: tableRef.current,
          start: "top 85%",
        },
      });
    },
    { scope: tableRef, dependencies: [results] }
  );

  if (results.length === 0) {
    return (
      <p className="text-f1-muted text-sm py-8 text-center font-mono">
        NO RESULTS FOR {season} SEASON
      </p>
    );
  }

  return (
    <div ref={tableRef} className="w-full">
      {/* Header */}
      <div
        className={cn(
          COLUMNS,
          "sticky top-0 z-10 py-2 text-[10px] text-f1-muted uppercase tracking-widest border-b border-f1-grid bg-f1-dark font-mono"
        )}
      >
        <span>RND</span>
        <span>RACE</span>
        <span className="hidden lg:block">DATE</span>
        <span className="text-right">GRID</span>
        <span className="text-right">POS</span>
        <span className="text-right">PTS</span>
      </div>

      {results.map((r, i) => {
        const grid = r.grid ?? 0;
        const pos = r.position ?? 0;
        const gridDelta = pos > 0 && grid > 0 ? grid - pos : 0;
        const isDnf = r.position == null;
        const date = r.date
          ? new Date(r.date + "T00:00:00").toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
            })
          : "\u2014";

        return (
          <Link
            key={r.race_id}
            href={`/races/${r.race_id}`}
            className={cn(
              "result-row",
              COLUMNS,
              "items-center h-11 text-sm border-b border-f1-grid/40",
              "transition-colors duration-100 hover:bg-f1-dark-3 cursor-pointer",
              i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3/50"
            )}
          >
            <span className="font-mono text-f1-muted tabular-nums">{r.round}</span>
            <div className="min-w-0">
              <span className="result-race block font-medium truncate">{r.race_name}</span>
              <span className="block lg:hidden font-mono text-xs text-f1-muted">{date}</span>
            </div>
            <span className="hidden lg:block font-mono text-xs text-f1-muted">{date}</span>
            <span className="text-right font-mono text-f1-muted tabular-nums">
              {r.grid ?? "\u2014"}
            </span>
            <div className="text-right flex items-center justify-end gap-1">
              <span
                className={cn(
                  "font-mono font-semibold tabular-nums",
                  isDnf ? "text-f1-red" : positionColor(r.position)
                )}
              >
                {isDnf ? "DNF" : r.position}
              </span>
              {gridDelta !== 0 && !isDnf && (
                <span
                  className={cn(
                    "text-[10px] font-mono tabular-nums",
                    gridDelta > 0 ? "text-f1-green" : "text-f1-red"
                  )}
                >
                  {gridDelta > 0 ? `+${gridDelta}` : gridDelta}
                </span>
              )}
            </div>
            <span className="text-right font-mono font-semibold tabular-nums">
              {(r.points ?? 0) > 0 ? formatPoints(r.points!) : "\u2014"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
