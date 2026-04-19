"use client";

import { useRef } from "react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { getTeamColor } from "@/lib/constants/teams";
import { formatPitDuration } from "@/lib/format";
import type { DriverStrategy } from "@/lib/schemas/races";

interface PitStopsTableProps {
  strategy: DriverStrategy[];
}

export function PitStopsTable({ strategy }: PitStopsTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const allStops = strategy
    .flatMap((s) =>
      s.pit_stops.map((ps) => ({ ...ps, driver: s.driver }))
    )
    .sort((a, b) => a.lap - b.lap);

  const validDurations = allStops
    .map((s) => s.duration_ms)
    .filter((d): d is number => d != null);
  const minDuration = validDurations.length ? Math.min(...validDurations) : null;
  const maxDuration = validDurations.length ? Math.max(...validDurations) : null;

  useGSAP(
    () => {
      if (respectsReducedMotion()) return;

      gsap.from(".pit-row", {
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

      // scaleX from 0→1 avoids width animation (no layout reflow)
      gsap.from(".pit-bar", {
        scaleX: 0,
        transformOrigin: "left center",
        duration: 0.6,
        ease: "pitwall-accel",
        stagger: 0.04,
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 85%",
          once: true,
        },
      });
    },
    { scope: containerRef, dependencies: [strategy] }
  );

  if (strategy.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center select-none">
        <p className="font-data text-[11px] tracking-[0.2em] text-f1-muted uppercase">
          No pit stop telemetry
        </p>
        <p className="text-f1-muted text-sm max-w-xs">
          Detailed undercut data is only available for races from the 2022 season onwards.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full">
      <div className="sticky top-0 z-10 grid grid-cols-[4rem_1fr_4rem_6rem_1fr] gap-x-4 px-4 py-2 text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark">
        <span>Lap</span>
        <span>Driver</span>
        <span className="text-right">Stop</span>
        <span className="text-right">Duration</span>
        <span>Relative</span>
      </div>

      {allStops.map((ps, i) => {
        const teamColor = getTeamColor(ps.driver.ref);
        const isFastest =
          ps.duration_ms != null &&
          minDuration != null &&
          ps.duration_ms === minDuration;

        // Bar width: longer duration = fuller bar (0.15 minimum so bars always visible)
        const barWidthPct =
          ps.duration_ms != null && maxDuration != null && maxDuration > 0
            ? Math.max(0.15, ps.duration_ms / maxDuration)
            : 0.15;

        return (
          <div
            key={`${ps.driver.ref}-${ps.stop_number}-${ps.lap}`}
            className={cn(
              "pit-row grid grid-cols-[4rem_1fr_4rem_6rem_1fr] gap-x-4 items-center px-4 h-11 text-sm border-b border-f1-grid/50",
              i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3",
              isFastest && "border-l-2 border-l-purple-500"
            )}
          >
            {/* Lap */}
            <span className="font-data text-f1-muted">{ps.lap}</span>

            {/* Driver */}
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-1 h-4 shrink-0"
                style={{ backgroundColor: teamColor }}
                aria-hidden="true"
              />
              <span
                className={cn("font-medium truncate", isFastest && "text-purple-400")}
                style={isFastest ? { textShadow: "0 0 6px var(--color-f1-purple)" } : undefined}
              >
                {ps.driver.surname}
              </span>
            </div>

            {/* Stop number */}
            <span className="text-right font-data text-f1-orange">{ps.stop_number}</span>

            {/* Duration */}
            <span
              className={cn(
                "text-right font-data",
                isFastest ? "text-purple-400" : "text-f1-text"
              )}
              style={isFastest ? { textShadow: "0 0 6px var(--color-f1-purple)" } : undefined}
            >
              {formatPitDuration(ps.duration_ms)}
            </span>

            {/* Duration bar */}
            <div className="h-1.5 bg-f1-dark overflow-hidden flex items-center">
              <div
                className="pit-bar h-full"
                style={{
                  width: `${barWidthPct * 100}%`,
                  backgroundColor: isFastest ? "var(--color-f1-purple)" : teamColor,
                  opacity: isFastest ? 1 : 0.7,
                }}
                aria-hidden="true"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
