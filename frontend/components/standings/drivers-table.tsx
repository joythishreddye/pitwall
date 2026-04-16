"use client";

import { useRef } from "react";
import Link from "next/link";
import { gsap, useGSAP, ScrollTrigger, respectsReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { positionColor } from "@/lib/format";
import { getTeamColor, getTeamHexColor } from "@/lib/constants/teams";
import type { DriverStanding } from "@/lib/schemas/standings";

void ScrollTrigger;

const COLS = "grid-cols-[3rem_2fr_1fr_5rem_4rem_2rem_1fr]";

export function DriversTable({
  drivers,
  maxPoints,
}: {
  drivers: DriverStanding[];
  maxPoints: number;
}) {
  const tableRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (respectsReducedMotion()) return;
      gsap.from(".standings-row-driver", {
        opacity: 0,
        x: -8,
        stagger: 0.025,
        duration: 0.3,
        ease: "pitwall-accel",
        scrollTrigger: { trigger: tableRef.current, start: "top 85%" },
      });
    },
    { scope: tableRef, dependencies: [drivers] }
  );

  return (
    <div ref={tableRef} className="w-full overflow-x-auto">
      {/* Sticky header — same left-edge budget as rows (4px border space + 12px pad = 16px) */}
      <div
        className={cn(
          "standings-header sticky top-0 z-10 grid gap-x-4 items-center py-2",
          "text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark",
          "border-l-4 border-l-transparent pr-4 pl-3 select-none",
          COLS
        )}
      >
        <span>Pos</span>
        <span>Driver</span>
        <span>Team</span>
        <span className="text-right">Pts</span>
        <span className="text-right">Wins</span>
        <span className="text-center">FL</span>
        <span />
      </div>

      {drivers.map((d, i) => {
        const teamColor = getTeamColor(d.constructor_name ?? d.constructor_ref ?? "");
        const hexColor = getTeamHexColor(d.constructor_ref ?? d.constructor_name ?? "");
        const barWidth = maxPoints > 0 ? (d.points / maxPoints) * 100 : 0;
        const isLeader = d.position === 1;

        return (
          <Link
            key={d.driver_ref}
            href={`/drivers/${d.driver_ref}`}
            className={cn(
              "standings-row-driver grid gap-x-4 items-center h-11 text-sm",
              "border-b border-f1-grid/50 border-l-4 pr-4 pl-3",
              "transition-colors duration-100 hover:bg-f1-dark-3 cursor-pointer",
              i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3",
              isLeader && "bg-white/[0.03]",
              COLS
            )}
            style={{ borderLeftColor: isLeader ? hexColor : "transparent" }}
          >
            {/* Position */}
            <span
              className={cn(
                "font-data tabular-nums text-base font-bold",
                positionColor(d.position)
              )}
            >
              {d.position}
            </span>

            {/* Driver */}
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-0.5 h-5 shrink-0"
                style={{ backgroundColor: teamColor }}
              />
              <span className="truncate">
                <span className="text-f1-muted">{d.forename} </span>
                <span className="font-semibold uppercase">{d.surname}</span>
              </span>
            </div>

            {/* Team */}
            <span className="text-f1-muted text-xs truncate">{d.constructor_name}</span>

            {/* Points */}
            <span className="text-right font-data tabular-nums font-semibold">
              {Math.floor(d.points)}
            </span>

            {/* Wins */}
            <span className="text-right font-data tabular-nums text-f1-muted">
              {d.wins > 0 ? d.wins : "—"}
            </span>

            {/* FL badge */}
            <div className="flex justify-center">
              {d.has_fastest_lap && (
                <span
                  className="text-[10px] font-data font-semibold leading-none px-1 py-0.5 border border-f1-purple/50"
                  style={{ color: "#A855F7", textShadow: "0 0 8px #A855F7" }}
                >
                  FL
                </span>
              )}
            </div>

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
          </Link>
        );
      })}
    </div>
  );
}
