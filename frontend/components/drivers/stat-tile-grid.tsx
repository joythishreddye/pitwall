"use client";

import { useRef, useState } from "react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { NumberCounter } from "@/components/ui/number-counter";

interface StatTileGridProps {
  championships: number;
  wins: number;
  podiums: number;
  poles: number;
  races: number;
  points: number;
}

interface TileProps {
  label: string;
  value: number;
  className?: string;
  gridArea?: string;
  paused?: boolean;
  large?: boolean;
}

function StatTile({ label, value, className = "", gridArea, paused = false, large = false }: TileProps) {
  return (
    <div
      className={`border border-f1-grid bg-f1-dark-2 p-3 rounded-sm flex flex-col justify-between ${className}`}
      style={gridArea ? { gridArea } : undefined}
    >
      <p className="text-[9px] text-f1-muted uppercase tracking-widest font-mono">{label}</p>
      <NumberCounter
        value={value}
        paused={paused}
        className={large ? "text-3xl font-black" : "text-xl font-semibold"}
      />
    </div>
  );
}

export function StatTileGrid({
  championships,
  wins,
  podiums,
  poles,
  races,
  points,
}: StatTileGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(true);

  useGSAP(
    () => {
      if (respectsReducedMotion()) {
        setPaused(false);
        return;
      }

      const tl = gsap.timeline({
        delay: 0.4,
        onStart: () => setPaused(false), // unlock counters on timeline start
      });

      tl.from(".tile-championships", {
        opacity: 0,
        scale: 0.95,
        duration: 0.35,
        ease: "pitwall-accel",
      })
        .from(
          ".tile-wins",
          { opacity: 0, y: 8, duration: 0.25, ease: "pitwall-accel" },
          "-=0.1"
        )
        .from(
          ".tile-podiums, .tile-poles",
          { opacity: 0, y: 8, stagger: 0.05, duration: 0.2, ease: "pitwall-accel" },
          "-=0.1"
        )
        .from(
          ".tile-races, .tile-points",
          { opacity: 0, y: 8, stagger: 0.05, duration: 0.2, ease: "pitwall-accel" },
          "-=0.1"
        );
    },
    { scope: containerRef }
  );

  return (
    <div
      ref={containerRef}
      className="grid gap-2 mb-8"
      style={{
        gridTemplateAreas: `
          "champ champ wins  wins"
          "champ champ pods  poles"
          "races races pts   pts"
        `,
        gridTemplateColumns: "repeat(4, 1fr)",
        gridTemplateRows: "repeat(3, minmax(72px, auto))",
      }}
    >
      <StatTile
        label="Championships"
        value={championships}
        paused={paused}
        large
        gridArea="champ"
        className="tile-championships"
      />
      <StatTile
        label="Wins"
        value={wins}
        paused={paused}
        gridArea="wins"
        className="tile-wins"
      />
      <StatTile
        label="Podiums"
        value={podiums}
        paused={paused}
        gridArea="pods"
        className="tile-podiums"
      />
      <StatTile
        label="Poles"
        value={poles}
        paused={paused}
        gridArea="poles"
        className="tile-poles"
      />
      <StatTile
        label="Races"
        value={races}
        paused={paused}
        gridArea="races"
        className="tile-races"
      />
      <StatTile
        label="Career Points"
        value={points}
        paused={paused}
        gridArea="pts"
        className="tile-points"
      />
    </div>
  );
}
