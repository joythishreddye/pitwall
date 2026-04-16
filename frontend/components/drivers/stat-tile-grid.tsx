"use client";

import { useRef, useState } from "react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { NumberCounter } from "@/components/ui/number-counter";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { SeasonStat } from "@/lib/schemas/drivers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatTileGridProps {
  championships: number;
  wins: number;
  podiums: number;
  poles: number;
  races: number;
  points: number;
  teamHex: string;
  careerSeasons: SeasonStat[];
}

interface TileProps {
  label: string;
  value: number;
  className?: string;
  gridArea?: string;
  paused?: boolean;
  large?: boolean;
  accentColor: string;
  /** Rate 0-100 for progress bar + secondary label. Null = no bar/label. */
  rate?: number | null;
  /** Extra className passed to the NumberCounter (e.g. "text-f1-gold") */
  valueClassName?: string;
}

// ---------------------------------------------------------------------------
// Career chart tooltip — dark-themed to match the design system
// ---------------------------------------------------------------------------

function CareerTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SeasonStat }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="border px-3 py-2"
      style={{
        backgroundColor: "var(--color-f1-dark-3)",
        borderColor: "var(--color-f1-grid)",
      }}
    >
      <p className="font-mono text-xs font-bold text-f1-text mb-0.5">{d.season}</p>
      <p className="font-mono text-[11px] text-f1-muted tabular-nums">
        {d.points} PTS &middot; {d.wins} WIN{d.wins !== 1 ? "S" : ""}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatTile
// ---------------------------------------------------------------------------

function StatTile({
  label,
  value,
  className = "",
  gridArea,
  paused = false,
  large = false,
  accentColor,
  rate = null,
  valueClassName,
}: TileProps) {
  return (
    <div
      className={cn(
        "relative border border-f1-grid bg-f1-dark-2 p-3 flex flex-col justify-between overflow-hidden",
        className
      )}
      style={
        gridArea
          ? { gridArea, borderLeftColor: accentColor, borderLeftWidth: 2 }
          : { borderLeftColor: accentColor, borderLeftWidth: 2 }
      }
    >
      <p className="text-[9px] text-f1-muted uppercase tracking-widest font-mono">{label}</p>

      <div>
        <NumberCounter
          value={value}
          paused={paused}
          className={cn(large ? "text-3xl font-black" : "text-xl font-semibold", valueClassName)}
        />
        {rate !== null && (
          <p className="font-mono text-[10px] text-f1-muted/50 mt-0.5 tabular-nums">
            {rate.toFixed(1)}% of races
          </p>
        )}
      </div>

      {/* Progress bar — team color fill proportional to rate */}
      {rate !== null && (
        <div className="absolute bottom-0 left-2 right-0 h-px bg-f1-grid/40">
          <div
            className="h-full"
            style={{ width: `${Math.min(rate, 100)}%`, backgroundColor: accentColor }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatTileGrid
// ---------------------------------------------------------------------------

export function StatTileGrid({
  championships,
  wins,
  podiums,
  poles,
  races,
  points,
  teamHex,
  careerSeasons,
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
        onStart: () => setPaused(false),
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
        )
        .from(
          ".tile-chart",
          { opacity: 0, y: 12, duration: 0.3, ease: "pitwall-accel" },
          "-=0.05"
        );
    },
    { scope: containerRef }
  );

  // Rates — guard against zero races to avoid NaN
  const winRate = races > 0 ? (wins / races) * 100 : null;
  const podiumRate = races > 0 ? (podiums / races) * 100 : null;
  const poleRate = races > 0 ? (poles / races) * 100 : null;

  const GOLD = "#FFD700";

  return (
    <div
      ref={containerRef}
      className="grid gap-2 mb-8"
      style={{
        gridTemplateAreas: `
          "champ champ wins  wins"
          "champ champ pods  poles"
          "races races pts   pts"
          "chart chart chart chart"
        `,
        gridTemplateColumns: "repeat(4, 1fr)",
        gridTemplateRows: "repeat(3, minmax(72px, auto)) minmax(190px, auto)",
      }}
    >
      {/* Championships — gold accent if driver has won */}
      <StatTile
        label="Championships"
        value={championships}
        paused={paused}
        large
        gridArea="champ"
        accentColor={championships > 0 ? GOLD : "var(--color-f1-grid)"}
        valueClassName={championships > 0 ? "text-f1-gold" : "text-f1-muted/40"}
        className="tile-championships"
      />

      <StatTile
        label="Wins"
        value={wins}
        paused={paused}
        gridArea="wins"
        accentColor={teamHex}
        rate={winRate}
        className="tile-wins"
      />

      <StatTile
        label="Podiums"
        value={podiums}
        paused={paused}
        gridArea="pods"
        accentColor={teamHex}
        rate={podiumRate}
        className="tile-podiums"
      />

      <StatTile
        label="Pole Positions"
        value={poles}
        paused={paused}
        gridArea="poles"
        accentColor={teamHex}
        rate={poleRate}
        className="tile-poles"
      />

      <StatTile
        label="Races"
        value={races}
        paused={paused}
        gridArea="races"
        accentColor={teamHex}
        className="tile-races"
      />

      <StatTile
        label="Career Points"
        value={points}
        paused={paused}
        gridArea="pts"
        accentColor={teamHex}
        className="tile-points"
      />

      {/* Career sparkline — full-width 7th tile */}
      {careerSeasons.length > 1 && (
        <div
          className="tile-chart border border-f1-grid bg-f1-dark-2 p-3 flex flex-col"
          style={{ gridArea: "chart", borderLeftColor: teamHex, borderLeftWidth: 2 }}
        >
          <p className="text-[9px] text-f1-muted uppercase tracking-widest font-mono mb-3">
            Career Points · By Season
          </p>

          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart
                data={careerSeasons}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="careerPtsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={teamHex} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={teamHex} stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                <XAxis
                  dataKey="season"
                  tick={{
                    fill: "var(--color-f1-muted)",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                  }}
                  axisLine={{ stroke: "var(--color-f1-grid)" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />

                <YAxis hide />

                <Tooltip
                  content={<CareerTooltip />}
                  cursor={{ stroke: "var(--color-f1-grid)", strokeWidth: 1 }}
                />

                <Area
                  type="monotone"
                  dataKey="points"
                  stroke={teamHex}
                  strokeWidth={1.5}
                  fill="url(#careerPtsGradient)"
                  dot={false}
                  activeDot={{ r: 3, fill: teamHex, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
