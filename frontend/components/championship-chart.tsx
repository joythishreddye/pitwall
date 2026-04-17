"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { gsap, useGSAP, DrawSVGPlugin, respectsReducedMotion } from "@/lib/gsap";
import { getTeamHexColor } from "@/lib/constants/teams";
import { cn } from "@/lib/utils";
import type { DriverProgression } from "@/lib/schemas/standings";

void DrawSVGPlugin;

// ---------------------------------------------------------------------------
// SVG coordinate system
//
// SVG_H is fixed. svgW is measured at runtime via ResizeObserver so the
// viewBox always matches the DOM element 1:1 — no preserveAspectRatio scaling,
// no blank space, no centring artefacts.
// ---------------------------------------------------------------------------
const SVG_H = 240;
const PAD = { t: 20, r: 24, b: 44, l: 48 };
const INNER_H = SVG_H - PAD.t - PAD.b;

function innerW(svgW: number) {
  return Math.max(0, svgW - PAD.l - PAD.r);
}
function xScale(round: number, maxRound: number, svgW: number): number {
  return PAD.l + ((round - 1) / Math.max(maxRound - 1, 1)) * innerW(svgW);
}
function yScale(pts: number, maxPts: number): number {
  return PAD.t + INNER_H - (pts / Math.max(maxPts, 1)) * INNER_H;
}
function buildPath(
  rounds: number[],
  points: number[],
  maxRound: number,
  maxPts: number,
  svgW: number
): string {
  if (!rounds.length || svgW <= 0) return "";
  return rounds
    .map(
      (r, i) =>
        `${i === 0 ? "M" : "L"}${xScale(r, maxRound, svgW).toFixed(1)} ${yScale(points[i], maxPts).toFixed(1)}`
    )
    .join(" ");
}

// ---------------------------------------------------------------------------
// ChartLine — shared shape for driver-mode and constructor-mode
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

function getPointsAtRound(driver: DriverProgression, round: number): number {
  let pts = 0;
  for (let i = 0; i < driver.rounds.length; i++) {
    if (driver.rounds[i] <= round) pts = driver.points[i];
    else break;
  }
  return pts;
}

/** One line per driver; leading scorer per team = solid, teammate = dashed */
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
  px: number;
  py: number;
}

export interface ChampionshipChartProps {
  progressions: DriverProgression[];
  roundLabels?: Record<number, string>;
  mode?: "drivers" | "constructors";
  /**
   * Compact mode: hides scanner, tooltip, and driver toggles.
   * Grid lines and axes are always shown — compact is for embedding in a
   * smaller card without interactive controls, not for stripping the chart.
   */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ChampionshipChart({
  progressions,
  roundLabels,
  mode = "drivers",
  compact = false,
}: ChampionshipChartProps) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  // containerRef is on the permanent outermost wrapper and NEVER moves,
  // regardless of loading state. This is critical: the ResizeObserver and
  // tooltip positioning both depend on it always being attached.
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scannerRef = useRef<SVGLineElement>(null);

  // ── State ─────────────────────────────────────────────────────────────────
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  // Measured container width in CSS pixels. 0 = not yet measured.
  const [svgW, setSvgW] = useState(0);

  // ── ResizeObserver ────────────────────────────────────────────────────────
  // Runs once on mount. containerRef.current is always the permanent wrapper
  // div — it is never null when this effect fires.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setSvgW(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────
  const lines =
    mode === "constructors"
      ? toConstructorLines(progressions)
      : toDriverLines(progressions);

  const allRounds = lines.flatMap((l) => l.rounds);
  const maxRound = allRounds.length ? Math.max(...allRounds) : 20;
  const allPts = lines.flatMap((l) => l.points);
  const maxPts = allPts.length ? Math.max(...allPts) : 400;

  const tickStep = maxRound <= 10 ? 1 : maxRound <= 20 ? 2 : 5;
  const ticks = Array.from(
    { length: Math.ceil(maxRound / tickStep) },
    (_, i) => Math.min((i + 1) * tickStep, maxRound)
  ).filter((r, i, arr) => arr.indexOf(r) === i);
  if (maxRound > 0 && !ticks.includes(1)) ticks.unshift(1);

  // ── GSAP animation ────────────────────────────────────────────────────────
  // Solid lines: DrawSVG left-to-right draw.
  // Dashed lines: opacity fade-in — DrawSVG overwrites strokeDasharray so we
  //   cannot use it on dashed paths.
  useGSAP(
    () => {
      if (!lines.length || svgW === 0) return;
      if (respectsReducedMotion()) {
        gsap.set(".chart-line, .chart-line-dash", { opacity: 0.85 });
        return;
      }
      gsap.from(".chart-line", {
        drawSVG: "0%",
        duration: 1.8,
        ease: "pitwall-accel",
        stagger: 0.04,
      });
      gsap.from(".chart-line-dash", {
        opacity: 0,
        duration: 1.0,
        ease: "pitwall-accel",
        stagger: 0.04,
        delay: 0.5,
      });
    },
    { scope: svgRef, dependencies: [progressions, mode, svgW] }
  );

  // ── Mouse handler ─────────────────────────────────────────────────────────
  // svgW === CSS pixel width of the SVG element, so mouse X maps 1:1 to SVG
  // user-unit X — no scale factor needed.
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (compact || !svgRef.current || !scannerRef.current || svgW === 0) return;
      const svgRect = svgRef.current.getBoundingClientRect();
      const containerRect = containerRef.current!.getBoundingClientRect();
      const iW = innerW(svgW);
      const mouseX = e.clientX - svgRect.left;
      const clampedX = Math.max(PAD.l, Math.min(PAD.l + iW, mouseX));
      const rawRound = ((clampedX - PAD.l) / iW) * (maxRound - 1) + 1;
      const round = Math.round(Math.max(1, Math.min(maxRound, rawRound)));

      gsap.to(scannerRef.current, {
        attr: { x1: xScale(round, maxRound, svgW), x2: xScale(round, maxRound, svgW) },
        duration: 0.08,
        ease: "none",
      });
      setTooltip({
        round,
        px: e.clientX - containerRect.left,
        py: e.clientY - containerRect.top,
      });
    },
    [compact, maxRound, svgW]
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // ── Toggle ────────────────────────────────────────────────────────────────
  const toggleLine = useCallback(
    (id: string) => {
      if (!svgRef.current) return;
      const isHiding = !hiddenIds.has(id);
      const el = svgRef.current.querySelector(`[data-id="${id}"]`);
      if (el) gsap.to(el, { opacity: isHiding ? 0 : 0.85, duration: 0.25, ease: "pitwall-accel" });
      setHiddenIds((prev) => {
        const next = new Set(prev);
        if (isHiding) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [hiddenIds]
  );

  // ── Tooltip data ──────────────────────────────────────────────────────────
  const tooltipRows =
    tooltip && !compact
      ? lines
          .filter((l) => !hiddenIds.has(l.id))
          .map((l) => {
            const rIdx = l.rounds.indexOf(tooltip.round);
            const prevRoundIdx =
              rIdx > 0
                ? rIdx - 1
                : l.rounds.reduce((best, r, i) => (r < tooltip.round ? i : best), -1);
            const pts = rIdx >= 0 ? l.points[rIdx] : null;
            const prevPts = prevRoundIdx >= 0 ? l.points[prevRoundIdx] : 0;
            const scored = pts != null ? pts - prevPts : null;
            return { ...l, pts, scored };
          })
          .filter((l) => l.pts != null)
          .sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0))
          .slice(0, mode === "constructors" ? 11 : 5)
      : [];

  const isLeftHalf = (tooltip?.px ?? 0) < svgW / 2;
  const tooltipRoundLabel =
    tooltip && roundLabels?.[tooltip.round]
      ? roundLabels[tooltip.round]
      : tooltip
      ? `Round ${tooltip.round}`
      : "";

  // ── Render ────────────────────────────────────────────────────────────────
  // The permanent wrapper div is ALWAYS rendered first so containerRef is
  // always attached when useEffect fires. Loading state and width-pending
  // state are handled inside it, not via early returns.
  return (
    <div ref={containerRef} className="relative w-full select-none">

      {/* Loading state — shown while progressions are empty */}
      {!progressions.length && (
        <div className="h-[240px] flex items-center justify-center">
          <span className="font-data text-xs text-f1-muted tracking-widest uppercase">
            Loading progression data...
          </span>
        </div>
      )}

      {/* Width pending — shown on first render before ResizeObserver fires */}
      {progressions.length > 0 && svgW === 0 && (
        <div style={{ height: SVG_H }} />
      )}

      {/* Chart — only rendered once both data and container width are known */}
      {progressions.length > 0 && svgW > 0 && (
        <>
          <svg
            ref={svgRef}
            // viewBox matches the SVG element dimensions exactly (1:1).
            // No preserveAspectRatio scaling → content always fills the element.
            viewBox={`0 0 ${svgW} ${SVG_H}`}
            width="100%"
            height={SVG_H}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            aria-label="Championship points progression"
            role="img"
          >
            {/* Grid lines — always shown (compact only hides controls) */}
            {[0.25, 0.5, 0.75, 1].map((frac) => {
              const y = PAD.t + INNER_H * (1 - frac);
              return (
                <g key={frac}>
                  <line
                    x1={PAD.l}
                    y1={y}
                    x2={PAD.l + innerW(svgW)}
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
                    {Math.round(maxPts * frac)}
                  </text>
                </g>
              );
            })}

            {/* X-axis baseline */}
            <line
              x1={PAD.l}
              y1={PAD.t + INNER_H}
              x2={PAD.l + innerW(svgW)}
              y2={PAD.t + INNER_H}
              stroke="var(--color-f1-grid)"
              strokeWidth={0.5}
            />

            {/* X-axis ticks & labels — always shown */}
            {ticks.map((r) => {
              const x = xScale(r, maxRound, svgW);
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
                    {roundLabels?.[r] ?? String(r)}
                  </text>
                </g>
              );
            })}

            {/* Data lines */}
            {lines.map((l) => {
              const hex = getTeamHexColor(l.teamRef);
              const d = buildPath(l.rounds, l.points, maxRound, maxPts, svgW);
              if (!d) return null;
              return (
                <path
                  key={l.id}
                  className={l.dash ? "chart-line-dash" : "chart-line"}
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

            {/* Cursor scanner — interactive mode only */}
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

          {/* Tooltip — interactive mode only */}
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
              <div className="px-3 py-1.5 border-b border-f1-grid">
                <span className="font-data text-xs text-f1-muted tabular-nums">
                  {tooltipRoundLabel}
                </span>
              </div>
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
                            ? {
                                background: `repeating-linear-gradient(90deg, ${hex} 0 4px, transparent 4px 8px)`,
                                height: 2,
                                marginTop: 3,
                              }
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

          {/* Driver/team toggles — interactive mode only */}
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
        </>
      )}
    </div>
  );
}
