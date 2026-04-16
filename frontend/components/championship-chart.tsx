"use client";

import { useRef, useState, useCallback } from "react";
import { gsap, useGSAP, DrawSVGPlugin, respectsReducedMotion } from "@/lib/gsap";
import { getTeamHexColor } from "@/lib/constants/teams";
import { findHeadshotUrl } from "@/lib/hooks/use-driver-photos";
import { cn } from "@/lib/utils";
import type { DriverProgression } from "@/lib/schemas/standings";
import type { OpenF1Driver } from "@/lib/hooks/use-driver-photos";

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
// Types
// ---------------------------------------------------------------------------
interface TooltipState {
  round: number;
  // Pixel position relative to the SVG container div (for tooltip placement)
  px: number;
  py: number;
}

interface ChampionshipChartProps {
  progressions: DriverProgression[];
  /** Optional headshot data from useDriverPhotos — used for tooltip */
  photos?: OpenF1Driver[];
  /** Compact mode: no scanner, no toggles, no tooltip (used on home preview) */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Loading / empty skeleton
// ---------------------------------------------------------------------------
function ChartSkeleton() {
  return (
    <div className="relative w-full overflow-hidden bg-f1-dark-2 border border-f1-grid">
      <div className="h-[240px] flex flex-col items-center justify-center gap-3">
        {/* Three flat placeholder lines */}
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
              x2={PAD.l + INNER_W * 0.4}
              y2={PAD.t + INNER_H * (1 - frac)}
              stroke="var(--color-f1-grid)"
              strokeWidth={1.5}
            />
          ))}
        </svg>
        {/* Scanner sweep */}
        <div className="relative w-full h-[1px] overflow-hidden">
          <div
            className="absolute inset-y-0 w-32"
            style={{
              background:
                "linear-gradient(to right, transparent, var(--color-f1-cyan), transparent)",
              animation: "scannerSweep 2s ease-in-out infinite",
            }}
          />
        </div>
        <span className="relative font-data text-xs text-f1-muted tracking-widest uppercase">
          Loading progression data...
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ChampionshipChart({
  progressions,
  photos,
  compact = false,
}: ChampionshipChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scannerRef = useRef<SVGLineElement>(null);

  const [hiddenDrivers, setHiddenDrivers] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // -------------------------------------------------------------------------
  // Derived geometry
  // -------------------------------------------------------------------------
  const allRounds = progressions.flatMap((p) => p.rounds);
  const maxRound = allRounds.length ? Math.max(...allRounds) : 20;
  const allPts = progressions.flatMap((p) => p.points);
  const maxPts = allPts.length ? Math.max(...allPts) : 400;

  // Leader = most points at their last recorded round
  const leader =
    progressions.length > 0
      ? progressions.reduce((a, b) => {
          const aLast = a.points[a.points.length - 1] ?? 0;
          const bLast = b.points[b.points.length - 1] ?? 0;
          return bLast > aLast ? b : a;
        })
      : null;

  // X-axis ticks (round labels) — show every N rounds to avoid crowding
  const tickStep = maxRound <= 10 ? 1 : maxRound <= 20 ? 2 : 5;
  const ticks = Array.from(
    { length: Math.ceil(maxRound / tickStep) },
    (_, i) => (i + 1) * tickStep
  ).filter((r) => r <= maxRound);
  // Always include round 1
  if (!ticks.includes(1)) ticks.unshift(1);

  // -------------------------------------------------------------------------
  // GSAP DrawSVG — lines draw in on mount / when data changes
  // -------------------------------------------------------------------------
  useGSAP(
    () => {
      if (!progressions.length) return;
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
    { scope: svgRef, dependencies: [progressions] }
  );

  // -------------------------------------------------------------------------
  // Cursor scanner (full mode only)
  // -------------------------------------------------------------------------
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (compact || !svgRef.current || !scannerRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mouseXPx = e.clientX - rect.left;
      const svgX = (mouseXPx / rect.width) * SVG_W;
      const clampedX = Math.max(PAD.l, Math.min(PAD.l + INNER_W, svgX));
      const rawRound = ((clampedX - PAD.l) / INNER_W) * (maxRound - 1) + 1;
      const round = Math.round(Math.max(1, Math.min(maxRound, rawRound)));

      gsap.to(scannerRef.current, {
        attr: { x1: xScale(round, maxRound), x2: xScale(round, maxRound) },
        duration: 0.08,
        ease: "none",
      });

      setTooltip({
        round,
        px: mouseXPx,
        py: e.clientY - rect.top,
      });
    },
    [compact, maxRound]
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // -------------------------------------------------------------------------
  // Driver toggle
  // -------------------------------------------------------------------------
  const toggleDriver = useCallback(
    (driverRef: string) => {
      if (!svgRef.current) return;
      const isHiding = !hiddenDrivers.has(driverRef);

      // Animate opacity on the path
      const pathEl = svgRef.current.querySelector(
        `.chart-line[data-driver="${driverRef}"]`
      );
      const glowEl = svgRef.current.querySelector(
        `.chart-glow[data-driver="${driverRef}"]`
      );
      const targets = [pathEl, glowEl].filter(Boolean);
      gsap.to(targets, {
        opacity: isHiding ? 0 : 1,
        duration: 0.25,
        ease: "pitwall-accel",
      });

      setHiddenDrivers((prev) => {
        const next = new Set(prev);
        if (isHiding) next.add(driverRef);
        else next.delete(driverRef);
        return next;
      });
    },
    [hiddenDrivers]
  );

  // -------------------------------------------------------------------------
  // Tooltip data computation
  // -------------------------------------------------------------------------
  const tooltipRows =
    tooltip && !compact
      ? progressions
          .filter((p) => !hiddenDrivers.has(p.driver_ref))
          .map((p) => {
            const rIdx = p.rounds.indexOf(tooltip.round);
            const prevIdx = tooltip.round > 1 ? p.rounds.indexOf(tooltip.round - 1) : -1;
            const pts = rIdx >= 0 ? p.points[rIdx] : null;
            const prev = prevIdx >= 0 ? p.points[prevIdx] : rIdx >= 0 ? (p.points[rIdx - 1] ?? 0) : 0;
            const scored = pts != null ? pts - prev : null;
            return { ...p, pts, scored };
          })
          .filter((p) => p.pts != null)
          .sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0))
          .slice(0, 5)
      : [];

  // -------------------------------------------------------------------------
  // Show skeleton when no data
  // -------------------------------------------------------------------------
  if (!progressions.length) return <ChartSkeleton />;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const isLeftHalf = (tooltip?.px ?? 0) < SVG_W / 2;

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
        <defs>
          {/* Glow filter for leader line */}
          <filter id="chart-leader-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

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
                  fontSize={10}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                >
                  {r}
                </text>
              </g>
            );
          })}

        {/* ---- Driver lines ---- */}
        {progressions.map((p) => {
          const isLeader = p.driver_ref === leader?.driver_ref;
          const hex = getTeamHexColor(p.constructor_ref);
          const d = buildPath(p.rounds, p.points, maxRound, maxPts);
          if (!d) return null;

          return (
            <g key={p.driver_ref}>
              {/* Glow layer for leader (rendered below main line) */}
              {isLeader && (
                <path
                  className="chart-glow"
                  data-driver={p.driver_ref}
                  d={d}
                  stroke={hex}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={0.35}
                  filter="url(#chart-leader-glow)"
                />
              )}
              {/* Main line */}
              <path
                className="chart-line"
                data-driver={p.driver_ref}
                d={d}
                stroke={hex}
                strokeWidth={isLeader ? 2.5 : 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={isLeader ? 1 : 0.55}
              />
              {/* Leader's latest data point marker */}
              {isLeader && p.rounds.length > 0 && (
                <circle
                  cx={xScale(p.rounds[p.rounds.length - 1], maxRound)}
                  cy={yScale(p.points[p.points.length - 1], maxPts)}
                  r={4}
                  fill={hex}
                  stroke="#0F0F0F"
                  strokeWidth={1.5}
                />
              )}
            </g>
          );
        })}

        {/* ---- Cursor scanner line (full mode only) ---- */}
        {!compact && (
          <line
            ref={scannerRef}
            className="chart-scanner"
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
          className={cn(
            "pointer-events-none absolute top-0 z-20 min-w-[160px] max-w-[220px]",
            "bg-f1-dark-2 border border-f1-grid",
            isLeftHalf ? "left-[calc(var(--tx)+12px)]" : "right-[calc(100%-var(--tx)+12px)]"
          )}
          style={
            {
              "--tx": `${tooltip.px}px`,
              top: Math.max(8, tooltip.py - 20),
            } as React.CSSProperties
          }
        >
          {/* Header */}
          <div className="px-3 py-1.5 border-b border-f1-grid">
            <span className="font-data text-xs text-f1-muted tabular-nums">
              Round {tooltip.round}
            </span>
          </div>
          {/* Driver rows */}
          <div className="py-1">
            {tooltipRows.map((row, idx) => {
              const hex = getTeamHexColor(row.constructor_ref);
              const photoUrl = photos
                ? findHeadshotUrl(photos, { surname: row.surname })
                : null;

              return (
                <div
                  key={row.driver_ref}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1",
                    idx === 0 && "bg-white/[0.02]"
                  )}
                >
                  {/* Position indicator */}
                  <span className="font-data tabular-nums text-[10px] text-f1-muted w-3 shrink-0">
                    {idx + 1}
                  </span>
                  {/* Team color dot */}
                  <div
                    className="w-1.5 h-1.5 shrink-0"
                    style={{ backgroundColor: hex }}
                  />
                  {/* Headshot (if available) */}
                  {photoUrl && idx === 0 && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl}
                      alt={row.surname}
                      className="w-6 h-6 object-cover object-top shrink-0"
                    />
                  )}
                  {/* Name */}
                  <span className="text-[11px] font-semibold uppercase truncate flex-1">
                    {row.surname}
                  </span>
                  {/* Points */}
                  <span className="font-data tabular-nums text-[11px] text-f1-text shrink-0">
                    {row.pts}
                  </span>
                  {/* Delta */}
                  {row.scored != null && row.scored > 0 && (
                    <span className="font-data tabular-nums text-[10px] text-f1-green shrink-0">
                      +{row.scored}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Driver toggles (full mode only) ---- */}
      {!compact && progressions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-1">
          {progressions.map((p) => {
            const hex = getTeamHexColor(p.constructor_ref);
            const hidden = hiddenDrivers.has(p.driver_ref);
            return (
              <button
                key={p.driver_ref}
                onClick={() => toggleDriver(p.driver_ref)}
                className={cn(
                  "flex items-center gap-1.5 text-[11px] font-semibold uppercase transition-opacity duration-150 cursor-pointer",
                  hidden ? "opacity-30" : "opacity-100"
                )}
                aria-label={`${hidden ? "Show" : "Hide"} ${p.surname}`}
              >
                {/* StatusDot styled toggle */}
                <span
                  className="w-2 h-2 shrink-0"
                  style={{
                    backgroundColor: hidden ? "var(--color-f1-muted)" : hex,
                    boxShadow: hidden ? "none" : `0 0 6px ${hex}99`,
                  }}
                />
                <span
                  className={cn(hidden ? "text-f1-muted" : "text-f1-text")}
                >
                  {p.surname}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
