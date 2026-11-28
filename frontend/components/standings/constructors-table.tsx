"use client";

import { useRef } from "react";
import { gsap, useGSAP, ScrollTrigger, respectsReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { positionColor } from "@/lib/format";
import { getTeamColor, getTeamHexColor } from "@/lib/constants/teams";
import type { ConstructorStanding } from "@/lib/schemas/standings";

void ScrollTrigger;

// Below 1024 px, position, constructor, wins and points; the points bar joins from 1024 px, as in the drivers' table
const COLS =
  "grid-cols-[2rem_minmax(0,1fr)_2.5rem_3.5rem] gap-x-3 lg:grid-cols-[3rem_2fr_4rem_5rem_1fr] lg:gap-x-4";

export function ConstructorsTable({
  constructors,
  maxPoints,
}: {
  constructors: ConstructorStanding[];
  maxPoints: number;
}) {
  const tableRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (respectsReducedMotion()) return;
      gsap.from(".standings-row-constructor", {
        opacity: 0,
        x: -8,
        stagger: 0.04,
        duration: 0.3,
        ease: "pitwall-accel",
        scrollTrigger: { trigger: tableRef.current, start: "top 85%" },
      });
    },
    { scope: tableRef, dependencies: [constructors] }
  );

  return (
    <div ref={tableRef} className="w-full overflow-x-auto">
      {/* Sticky header */}
      <div
        className={cn(
          "sticky top-0 z-10 grid items-center py-2",
          "text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark",
          "px-4 select-none",
          COLS
        )}
      >
        <span>Pos</span>
        <span>Constructor</span>
        <span className="text-right">Wins</span>
        <span className="standings-pts-heading text-right">Pts</span>
        <span className="hidden lg:block" />
      </div>

      {constructors.map((c, i) => {
        const teamColor = getTeamColor(c.constructor_ref);
        const hexColor = getTeamHexColor(c.constructor_ref);
        const barWidth = maxPoints > 0 ? (c.points / maxPoints) * 100 : 0;

        return (
          <div
            key={c.constructor_ref}
            className={cn(
              "standings-row-constructor grid items-center h-11 text-sm px-4",
              "border-b border-f1-grid/50",
              "transition-colors duration-100 hover:bg-f1-dark-3",
              i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3",
              COLS
            )}
          >
            {/* Position */}
            <span
              className={cn(
                "font-data tabular-nums text-base font-bold",
                positionColor(c.position)
              )}
            >
              {c.position}
            </span>

            {/* Constructor */}
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-0.5 h-5 shrink-0"
                style={{ backgroundColor: teamColor }}
              />
              <span className="standings-name min-w-0 flex-1 truncate font-semibold">{c.name}</span>
            </div>

            {/* Wins */}
            <span className="text-right font-data tabular-nums text-f1-muted">
              {c.wins > 0 ? c.wins : "—"}
            </span>

            {/* Points */}
            <span className="standings-pts text-right font-data tabular-nums font-semibold">
              {Math.floor(c.points)}
            </span>

            {/* Win bar */}
            <div className="hidden h-1.5 overflow-hidden bg-f1-grid/30 lg:block">
              <div
                className="h-full"
                style={{
                  width: `${barWidth}%`,
                  background: `linear-gradient(to right, ${hexColor}, ${hexColor}33)`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
