"use client";

import { useRef } from "react";
import { gsap, useGSAP, ScrollTrigger, respectsReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { positionColor } from "@/lib/format";
import { getTeamColor, getTeamHexColor } from "@/lib/constants/teams";
import type { ConstructorStanding } from "@/lib/schemas/standings";

void ScrollTrigger;

const COLS = "grid-cols-[3rem_2fr_4rem_5rem_1fr]";

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
          "sticky top-0 z-10 grid gap-x-4 items-center py-2",
          "text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark",
          "px-4 select-none",
          COLS
        )}
      >
        <span>Pos</span>
        <span>Constructor</span>
        <span className="text-right">Wins</span>
        <span className="text-right">Pts</span>
        <span />
      </div>

      {constructors.map((c, i) => {
        const teamColor = getTeamColor(c.constructor_ref);
        const hexColor = getTeamHexColor(c.constructor_ref);
        const barWidth = maxPoints > 0 ? (c.points / maxPoints) * 100 : 0;
        const isLeader = c.position === 1;

        return (
          <div
            key={c.constructor_ref}
            className={cn(
              "standings-row-constructor grid gap-x-4 items-center h-11 text-sm px-4",
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
              <span className="font-semibold truncate">{c.name}</span>
            </div>

            {/* Wins */}
            <span className="text-right font-data tabular-nums text-f1-muted">
              {c.wins > 0 ? c.wins : "—"}
            </span>

            {/* Points */}
            <span className="text-right font-data tabular-nums font-semibold">
              {Math.floor(c.points)}
            </span>

            {/* Win bar */}
            <div className="h-1.5 bg-f1-grid/30 overflow-hidden">
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
