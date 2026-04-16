"use client";

import { useRef, useState, useCallback } from "react";
import { gsap, useGSAP, DrawSVGPlugin, respectsReducedMotion } from "@/lib/gsap";
import { getTeamHexColor } from "@/lib/constants/teams";
import { cn } from "@/lib/utils";
import type { DriverProgression } from "@/lib/schemas/standings";

void DrawSVGPlugin;

// ---------------------------------------------------------------------------
// SVG coordinate system
// ---------------------------------------------------------------------------
const SVG_W = 760;
const SVG_H = 240;
const PAD = { t: 20, r: 24, b: 44, l: 48 };
const INNER_W = SVG_W - PAD.l - PAD.r;
const INNER_H = SVG_H - PAD.t - PAD.b;

function xScale(round: number, maxRound: number): number {
  return PAD.l + ((round - 1) / Math.max(maxRound - 1, 1)) * INNER_W;
}
function yScale(pts: number, maxPts: number): number {
  return PAD.t + INNER_H - (pts / Math.max(maxPts, 1)) * INNER_H;
}
function buildPath(
  rounds: number[],
  points: number[],
  maxRound: number,
  maxPts: number
): string {
  return rounds
    .map(
      (r, i) =>
        `${i === 0 ? "M" : "L"}${xScale(r, maxRound).toFixed(1)} ${yScale(points[i], maxPts).toFixed(1)}`
    )
    .join(" ");
}

// ---------------------------------------------------------------------------
// Normalised line shape — shared by driver-mode and constructor-mode
// ---------------------------------------------------------------------------
interface ChartLine {
  id: string;
  label: string;
  teamRef: string;
  rounds: number[];
  points: number[];
  /** Second driver per team gets a dashed stroke */
  dash: boolean;
}

/** Return this driver's cumulative points as of a given round */
function getPointsAtRound(driver: DriverProgression, round: number): number {
  let pts = 0;
  for (let i = 0; i < driver.rounds.length; i++) {
    if (driver.rounds[i] <= round) pts = driver.points[i];
    else break;
  }
  return pts;
}

/** One line per driver; leading scorer per team = solid, second = dashed */
function toDriverLines(progressions: DriverProgression[]): ChartLine[] {
  const byTeam = new Map<string, DriverProgression[]>();
  for (const p of progressions) {
    const arr = byTeam.get(p.constructor_ref) ?? [];
    arr.push(p);
    byTeam.set(p.constructor_ref, arr);
  }
  const lines: ChartLine[] = [];
  for (const [teamRef, drivers] of byTeam.entries()) {
    const sorted = [...drivers].sort((a, b) => {
      const aLast = a.points[a.points.length - 1] ?? 0;
      const bLast = b.points[b.points.length - 1] ?? 0;
      return bLast - aLast;
    });
    sorted.forEach((d, i) => {
      lines.push({
        id: d.driver_ref,
        label: d.surname.toUpperCase(),
        teamRef,
        rounds: d.rounds,
        points: d.points,
        dash: i >= 1,
      });
    });
  }
  return lines;
}

/** One line per team — sum both drivers' cumulative points at each round */
function toConstructorLines(progressions: DriverProgression[]): ChartLine[] {
  const byTeam = new Map<string, DriverProgression[]>();
  for (const p of progressions) {
    const arr = byTeam.get(p.constructor_ref) ?? [];
    arr.push(p);
    byTeam.set(p.constructor_ref, arr);
  }
  return Array.from(byTeam.entries()).map(([teamRef, drivers]) => {
    const allRounds = [...new Set(drivers.flatMap((d) => d.rounds))].sort(
      (a, b) => a - b
    );
    const points = allRounds.map((round) =>
      drivers.reduce((sum, d) => sum + getPointsAtRound(d, round), 0)
    );
    const label = teamRef
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return { id: teamRef, label, teamRef, rounds: allRounds, points, dash: false };
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TooltipState {
  round: number;
  px: number; // mouse X in px, relative to container
  py: number; // mouse Y in px, relative to container
}

export interface ChampionshipChartProps {
  progressions: DriverProgression[];
  /** Map of round number → label (country or circuit name) for x-axis / tooltip */
  roundLabels?: Record<number, string>;
  /** "constructors" aggregates driver points into team totals */
  mode?: "drivers" | "constructors";
  /** Compact mode: DrawSVG only, no scanner / toggles / tooltip (home preview) */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function ChartSkeleton() {
  return (
    <div className="relative w-full overflow-hidden h-[240px] flex items-center justify-center">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      >
        {[0.3, 0.55, 0.75].map((frac, i) => (
          <line
            key={i}
            x1={PAD.l}
            y1={PAD.t + INNER_H * (1 - frac)}
            x2={PAD.l + INNER_W * 0.35}
            y2={PAD.t + INNER_H * (1 - frac)}
            stroke="var(--color-f1-grid)"
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <span className="relative font-data text-xs text-f1-muted tracking-widest uppercase z-10">
        Loading progression data...
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ChampionshipChart({
  progressions,
  roundLabels,
  mode = "drivers",
  compact = false,
}: ChampionshipChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scannerRef = useRef<SVGLineElement>(null);

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // -------------------------------------------------------------------------
  // Compute chart lines from progressions
  // -------------------------------------------------------------------------
  const lines =
    mode === "constructors"
      ? toConstructorLines(progressions)
      : toDriverLines(progressions);

  // -------------------------------------------------------------------------
  // Geometry bounds
  // -------------------------------------------------------------------------
  const allRounds = lines.flatMap((l) => l.rounds);
  const maxRound = allRounds.length ? Math.max(...allRounds) : 20;
  const allPts = lines.flatMap((l) => l.points);
  const maxPts = allPts.length ? Math.max(...allPts) : 400;

  // X-axis ticks — show every N rounds to avoid crowding
  const tickStep = maxRound <= 10 ? 1 : maxRound <= 20 ? 2 : 5;
  const ticks = Array.from(
    { length: Math.ceil(maxRound / tickStep) },
    (_, i) => Math.min((i + 1) * tickStep, maxRound)
  ).filter((r, i, arr) => arr.indexOf(r) === i);
  if (!ticks.includes(1)) ticks.unshift(1);

  // -------------------------------------------------------------------------
  // GSAP DrawSVG
  // -------------------------------------------------------------------------
  useGSAP(
    () => {
      if (!lines.length) return;
      if (respectsReducedMotion()) {
        gsap.set(".chart-line", { drawSVG: "100%" });
        return;
      }
      gsap.from(".chart-line", {
        drawSVG: "0%",
        duration: 1.8,
        ease: "pitwall-accel",
        stagger: 0.04,
      });
    },
    { scope: svgRef, dependencies: [progressions, mode] }
  );

  // -------------------------------------------------------------------------
  // Cursor scanner
  // -------------------------------------------------------------------------
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (compact || !svgRef.current || !scannerRef.current || !containerRef.current) return;
      const svgRect = svgRef.current.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();

      const mouseXInSvg = e.clientX - svgRect.left;
      const svgX = (mouseXInSvg / svgRect.width) * SVG_W;
      const clampedX = Math.max(PAD.l, Math.min(PAD.l + INNER_W, svgX));
      const rawRound = ((clampedX - PAD.l) / INNER_W) * (maxRound - 1) + 1;
      const round = Math.round(Math.max(1, Math.min(maxRound, rawRound)));

      gsap.to(scannerRef.current, {
        attr: { x1: xScale(round, maxRound), x2: xScale(round, maxRound) },
        duration: 0.08,
        ease: "none",
      });

      // px/py relative to the container div (for tooltip absolute positioning)
      setTooltip({
        round,
        px: e.clientX - containerRect.left,
        py: e.clientY - containerRect.top,
      });
    },
    [compact, maxRound]
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // -------------------------------------------------------------------------
  // Toggle visibility
  // -------------------------------------------------------------------------
  const toggleLine = useCallback(
    (id: string) => {
      if (!svgRef.current) return;
      const isHiding = !hiddenIds.has(id);
      const pathEl = svgRef.current.querySelector(`.chart-line[data-id="${id}"]`);
      if (pathEl) gsap.to(pathEl, { opacity: isHiding ? 0 : 1, duration: 0.25, ease: "pitwall-accel" });
      setHiddenIds((prev) => {
        const next = new Set(prev);
        if (isHiding) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [hiddenIds]
  );

  // -------------------------------------------------------------------------
  // Tooltip data
  // -------------------------------------------------------------------------
  const tooltipRows =
    tooltip && !compact
      ? lines
          .filter((l) => !hiddenIds.has(l.id))
          .map((l) => {
            const rIdx = l.rounds.indexOf(tooltip.round);
            // For drivers, also look for prev round
            const prevIdx = rIdx > 0 ? rIdx - 1 : -1;
            const prevRoundIdx =
              prevIdx >= 0
                ? prevIdx
                : l.rounds.findIndex((r) => r < tooltip.round) >= 0
                ? l.rounds.reduce(
                    (best, r, i) => (r < tooltip.round ? i : best),
                    -1
                  )
                : -1;
            const pts = rIdx >= 0 ? l.points[rIdx] : null;
            const prevPts = prevRoundIdx >= 0 ? l.points[prevRoundIdx] : 0;
            const scored = pts != null ? pts - prevPts : null;
            return { ...l, pts, scored };
          })
          .filter((l) => l.pts != null)
          .sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0))
          .slice(0, mode === "constructors" ? 11 : 5)
      : [];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (!progressions.length) return <ChartSkeleton />;

  // Tooltip flips sides at the midpoint
  const containerWidth = containerRef.current?.offsetWidth ?? 800;
  const isLeftHalf = (tooltip?.px ?? 0) < containerWidth / 2;

  const tooltipRoundLabel =
    tooltip && roundLabels?.[tooltip.round]
      ? roundLabels[tooltip.round]
      : tooltip
      ? `Round ${tooltip.round}`
      : "";

  return (
    <div ref={containerRef} className="relative w-full select-none">
      {/* SVG chart */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full"
        style={{ height: compact ? 180 : 240 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        aria-label="Championship points progression"
        role="img"
      >
        {/* ---- Grid lines ---- */}
        {!compact &&
          [0.25, 0.5, 0.75, 1].map((frac) => {
            const y = PAD.t + INNER_H * (1 - frac);
            const label = Math.round(maxPts * frac);
            return (
              <g key={frac}>
                <line
                  x1={PAD.l}
                  y1={y}
                  x2={PAD.l + INNER_W}
                  y2={y}
                  stroke="var(--color-f1-grid)"
                  strokeWidth={0.5}
                  strokeDasharray="4 4"
                />
                <text
                  x={PAD.l - 6}
                  y={y + 4}
                  fill="var(--color-f1-muted)"
                  fontSize={10}
                  textAnchor="end"
                  fontFamily="var(--font-mono)"
                >
                  {label}
                </text>
              </g>
            );
          })}

        {/* ---- X-axis baseline ---- */}
        <line
          x1={PAD.l}
          y1={PAD.t + INNER_H}
          x2={PAD.l + INNER_W}
          y2={PAD.t + INNER_H}
          stroke="var(--color-f1-grid)"
          strokeWidth={0.5}
        />

        {/* ---- X-axis ticks & labels ---- */}
        {!compact &&
          ticks.map((r) => {
            const x = xScale(r, maxRound);
            const label = roundLabels?.[r] ?? String(r);
            return (
              <g key={r}>
                <line
                  x1={x}
                  y1={PAD.t + INNER_H}
                  x2={x}
                  y2={PAD.t + INNER_H + 4}
                  stroke="var(--color-f1-grid)"
                  strokeWidth={0.5}
                />
                <text
                  x={x}
                  y={PAD.t + INNER_H + 14}
                  fill="var(--color-f1-muted)"
                  fontSize={9}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                >
                  {label}
                </text>
              </g>
            );
          })}

        {/* ---- Lines ---- */}
        {lines.map((l) => {
          const hex = getTeamHexColor(l.teamRef);
          const d = buildPath(l.rounds, l.points, maxRound, maxPts);
          if (!d) return null;
          return (
            <path
              key={l.id}
              className="chart-line"
              data-id={l.id}
              d={d}
              stroke={hex}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={l.dash ? "6 4" : undefined}
              fill="none"
              opacity={0.85}
            />
          );
        })}

        {/* ---- Cursor scanner line ---- */}
        {!compact && (
          <line
            ref={scannerRef}
            x1={PAD.l}
            y1={PAD.t}
            x2={PAD.l}
            y2={PAD.t + INNER_H}
            stroke="var(--color-f1-cyan)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={tooltip ? 0.6 : 0}
          />
        )}
      </svg>

      {/* ---- Hover tooltip ---- */}
      {!compact && tooltip && tooltipRows.length > 0 && (
        <div
          className="pointer-events-none absolute z-20 min-w-[160px] max-w-[200px] bg-f1-dark-2 border border-f1-grid"
          style={{
            ...(isLeftHalf
              ? { left: `${tooltip.px + 14}px` }
              : { right: `calc(100% - ${tooltip.px}px + 14px)` }),
            top: `${Math.max(4, tooltip.py - 10)}px`,
          }}
        >
          {/* Header */}
          <div className="px-3 py-1.5 border-b border-f1-grid">
            <span className="font-data text-xs text-f1-muted tabular-nums">
              {tooltipRoundLabel}
            </span>
          </div>
          {/* Rows */}
          <div className="py-1">
            {tooltipRows.map((row, idx) => {
              const hex = getTeamHexColor(row.teamRef);
              return (
                <div
                  key={row.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-[3px]",
                    idx === 0 && "bg-white/[0.02]"
                  )}
                >
                  <span className="font-data tabular-nums text-[10px] text-f1-muted w-3 shrink-0">
                    {idx + 1}
                  </span>
                  <div
                    className="shrink-0"
                    style={{
                      width: 8,
                      height: 8,
                      backgroundColor: hex,
                      ...(row.dash
                        ? { background: `repeating-linear-gradient(90deg, ${hex} 0 4px, transparent 4px 8px)`, height: 2, marginTop: 3 }
                        : {}),
                    }}
                  />
                  <span className="text-[11px] font-semibold uppercase truncate flex-1">
                    {row.label}
                  </span>
                  <span className="font-data tabular-nums text-[11px] text-f1-text shrink-0">
                    {row.pts}
                  </span>
                  {row.scored != null && (
                    <span
                      className={cn(
                        "font-data tabular-nums text-[10px] shrink-0",
                        row.scored > 0 ? "text-f1-green" : "text-f1-muted"
                      )}
                    >
                      +{row.scored}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Toggle controls ---- */}
      {!compact && lines.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-1">
          {lines.map((l) => {
            const hex = getTeamHexColor(l.teamRef);
            const hidden = hiddenIds.has(l.id);
            return (
              <button
                key={l.id}
                onClick={() => toggleLine(l.id)}
                className={cn(
                  "flex items-center gap-1.5 text-[11px] font-semibold uppercase transition-opacity duration-150 cursor-pointer",
                  hidden ? "opacity-30" : "opacity-100"
                )}
                aria-label={`${hidden ? "Show" : "Hide"} ${l.label}`}
              >
                {/* Swatch — solid rect or dashed bar matching line style */}
                <span
                  className="shrink-0"
                  style={
                    l.dash
                      ? {
                          display: "inline-block",
                          width: 16,
                          height: 2,
                          marginBottom: 1,
                          background: `repeating-linear-gradient(90deg, ${hidden ? "var(--color-f1-muted)" : hex} 0 4px, transparent 4px 8px)`,
                        }
                      : {
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          backgroundColor: hidden ? "var(--color-f1-muted)" : hex,
                          boxShadow: hidden ? "none" : `0 0 5px ${hex}88`,
                        }
                  }
                />
                <span className={hidden ? "text-f1-muted" : "text-f1-text"}>
                  {l.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
