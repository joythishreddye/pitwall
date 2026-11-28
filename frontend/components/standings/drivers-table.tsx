"use client";

import { useRef } from "react";
import Link from "next/link";
import { gsap, useGSAP, ScrollTrigger, respectsReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { positionColor } from "@/lib/format";
import { getTeamColor, getTeamHexColor } from "@/lib/constants/teams";
import type { DriverStanding } from "@/lib/schemas/standings";

void ScrollTrigger;

// Below 1024 px, position, driver (team underneath), wins and points; the team column and the points bar join from
// 1024 px (at 768 the sidebar leaves the rows about 450 px, too narrow for them and a full surname).
// One column list for the header and the rows, so the headings sit over their columns at every width.
const COLS =
  "grid-cols-[2rem_minmax(0,1fr)_2.5rem_3.5rem] gap-x-3 lg:grid-cols-[3rem_2fr_1fr_4rem_5rem_1fr] lg:gap-x-4";

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
      {/* Sticky header */}
      <div
        className={cn(
          "standings-header sticky top-0 z-10 grid items-center py-2",
          "text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark",
          "px-4 select-none",
          COLS
        )}
      >
        <span>Pos</span>
        <span>Driver</span>
        <span className="hidden lg:block">Team</span>
        <span className="text-right">Wins</span>
        <span className="standings-pts-heading text-right">Pts</span>
        <span className="hidden lg:block" />
      </div>

      {drivers.map((d, i) => {
        const teamColor = getTeamColor(d.constructor_name ?? d.constructor_ref ?? "");
        const hexColor = getTeamHexColor(d.constructor_ref ?? d.constructor_name ?? "");
        const barWidth = maxPoints > 0 ? (d.points / maxPoints) * 100 : 0;

        return (
          <Link
            key={d.driver_ref}
            href={`/drivers/${d.driver_ref}`}
            className={cn(
              "standings-row-driver grid items-center h-11 text-sm px-4",
              "border-b border-f1-grid/50",
              "transition-colors duration-100 hover:bg-f1-dark-3 cursor-pointer",
              i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3",
              COLS
            )}
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
              <div className="standings-name flex min-w-0 flex-1 flex-col">
                <span className="truncate">
                  {/* the first name joins from 1024 px, where the driver's column has room for both */}
                  <span className="hidden text-f1-muted lg:inline">{d.forename} </span>
                  <span className="font-semibold uppercase">{d.surname}</span>
                </span>
                {/* the team under the name below 1024 px; its own column from there, beside the points bar */}
                <span className="truncate text-xs text-f1-muted lg:hidden">{d.constructor_name}</span>
              </div>
            </div>

            {/* Team */}
            <span className="hidden truncate text-xs text-f1-muted lg:block">{d.constructor_name}</span>

            {/* Wins */}
            <span className="text-right font-data tabular-nums text-f1-muted">
              {d.wins > 0 ? d.wins : "—"}
            </span>

            {/* Points */}
            <span className="standings-pts text-right font-data tabular-nums font-semibold">
              {Math.floor(d.points)}
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
          </Link>
        );
      })}
    </div>
  );
}
