"use client";

import { useRef } from "react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { StatusDot } from "@/components/ui";

// Mock driver line data for the blurred championship chart
const MOCK_LINES = [
  { points: "0,85 45,65 90,50 135,58 180,38 225,28 270,22 315,18 360,14 400,10", color: "#3671C6", opacity: 0.9 },
  { points: "0,70 45,80 90,68 135,45 180,55 225,48 270,38 315,30 360,35 400,30", color: "#FF8000", opacity: 0.8 },
  { points: "0,60 45,55 90,75 135,80 180,70 225,65 270,58 315,50 360,48 400,52", color: "#E8002D", opacity: 0.7 },
  { points: "0,90 45,85 90,88 135,92 180,82 225,78 270,72 315,68 360,60 400,65", color: "#27F4D2", opacity: 0.5 },
] as const;

const PREDICTION_CARDS = [
  {
    label: "RACE WINNER",
    driver: "ANTONELLI",
    team: "Mercedes",
    confidence: "74.3%",
    color: "#27F4D2",
  },
  {
    label: "PODIUM FINISH",
    driver: "PIASTRI",
    team: "McLaren",
    confidence: "61.8%",
    color: "#FF8000",
  },
  {
    label: "FASTEST LAP",
    driver: "VERSTAPPEN",
    team: "Red Bull",
    confidence: "41.2%",
    color: "#3671C6",
  },
  {
    label: "DNF RISK",
    driver: "HAMILTON",
    team: "Ferrari",
    confidence: "12.6%",
    color: "#E8002D",
  },
] as const;

export default function PredictionsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      if (respectsReducedMotion()) return;

      // Blinking cursor in status badge
      if (cursorRef.current) {
        gsap.to(cursorRef.current, {
          opacity: 0,
          duration: 0.5,
          ease: "steps(1)",
          repeat: -1,
          yoyo: true,
        });
      }

      // 3 scan lines at different vertical positions, staggered
      gsap.utils.toArray<HTMLElement>(".pred-scan-line").forEach((line, i) => {
        gsap
          .timeline({ repeat: -1, delay: i * 0.85 })
          .fromTo(line, { xPercent: -100 }, { xPercent: 400, duration: 2.5, ease: "none" })
          .set(line, { xPercent: -100 });
      });

      // Page entrance: header then content
      const tl = gsap.timeline();
      tl.from(".pred-header", { opacity: 0, y: -8, duration: 0.3, ease: "pitwall-accel" })
        .from(".pred-status", { opacity: 0, duration: 0.25 }, "-=0.1")
        .from(".pred-chart", { opacity: 0, y: 12, duration: 0.35, ease: "pitwall-accel" }, "-=0.05")
        .from(".pred-card", { opacity: 0, y: 8, stagger: 0.07, duration: 0.3, ease: "pitwall-accel" }, "-=0.15")
        .from(".pred-strategy", { opacity: 0, y: 8, duration: 0.3, ease: "pitwall-accel" }, "-=0.1");
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef} className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="pred-header flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-f1-muted mb-1">
            Phase 2 · Not yet active
          </p>
          <h1 className="text-2xl font-bold tracking-tight font-[family-name:var(--font-ibm-plex)]">
            Predictive Intelligence
          </h1>
        </div>

        {/* Status badge */}
        <div className="pred-status flex-shrink-0 border border-f1-grid bg-f1-dark-2 px-3 py-2 font-mono text-[10px] uppercase tracking-wider">
          <div className="flex items-center gap-2 mb-1">
            <StatusDot variant="caution" />
            <span className="text-f1-yellow">System Status</span>
          </div>
          <div className="text-f1-muted">
            Phase 2 — Prediction Engine
            <br />
            <span className="text-f1-text">Initializing</span>
            <span ref={cursorRef} className="text-f1-cyan ml-0.5">▋</span>
          </div>
        </div>
      </div>

      {/* Content area with scan lines overlay */}
      <div className="relative space-y-4">
        {/* Scan lines — absolute within content area */}
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          <div className="pred-scan-line absolute top-[22%] h-px w-1/4 bg-gradient-to-r from-transparent via-f1-cyan/60 to-transparent" />
          <div className="pred-scan-line absolute top-[55%] h-px w-1/4 bg-gradient-to-r from-transparent via-f1-cyan/40 to-transparent" />
          <div className="pred-scan-line absolute top-[80%] h-px w-1/4 bg-gradient-to-r from-transparent via-f1-cyan/50 to-transparent" />
        </div>

        {/* Championship Simulation chart — blurred mock */}
        <div className="pred-chart border border-f1-grid bg-f1-dark-2 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-widest text-f1-muted">
              Championship Simulation
            </span>
            <span className="text-[10px] font-mono text-f1-grid border border-f1-grid px-2 py-0.5">
              Monte Carlo · 10,000 runs
            </span>
          </div>

          {/* Mock SVG chart — blurred */}
          <div
            className="relative h-36 overflow-hidden"
            style={{ filter: "blur(5px) brightness(0.55) saturate(0.4)" }}
            aria-hidden="true"
          >
            {/* Y-axis grid lines */}
            <svg
              viewBox="0 0 400 100"
              className="absolute inset-0 w-full h-full"
              preserveAspectRatio="none"
            >
              {[25, 50, 75].map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={y}
                  x2="400"
                  y2={y}
                  stroke="#2B2B2B"
                  strokeWidth="1"
                />
              ))}
              {MOCK_LINES.map((line, i) => (
                <polyline
                  key={i}
                  points={line.points}
                  stroke={line.color}
                  strokeWidth={i === 0 ? 2.5 : 1.5}
                  strokeOpacity={line.opacity}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {/* P1 position fill */}
              <polyline
                points="0,85 45,65 90,50 135,58 180,38 225,28 270,22 315,18 360,14 400,10 400,100 0,100"
                fill="#3671C6"
                fillOpacity={0.08}
                stroke="none"
              />
            </svg>

            {/* X-axis round labels */}
            <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1">
              {[1, 3, 5, 7, 9, 11, 13, 15, 17, 24].map((r) => (
                <span
                  key={r}
                  className="text-[9px] font-mono text-f1-muted"
                >
                  R{r}
                </span>
              ))}
            </div>
          </div>

          {/* Lock overlay */}
          <div className="mt-2 flex items-center justify-center gap-2 text-f1-muted font-mono text-[10px] uppercase tracking-widest">
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11 7V5a3 3 0 0 0-6 0v2H4v7h8V7h-1ZM7 5a1 1 0 1 1 2 0v2H7V5Z" />
            </svg>
            Available in Phase 2
          </div>
        </div>

        {/* 4 Prediction cards — blurred mock content */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {PREDICTION_CARDS.map((card) => (
            <div
              key={card.label}
              className="pred-card border border-f1-grid bg-f1-dark-2 p-4 relative overflow-hidden"
            >
              {/* Left accent border */}
              <div
                className="absolute left-0 top-0 bottom-0 w-0.5"
                style={{ backgroundColor: card.color }}
              />

              <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-f1-muted mb-3 pl-2">
                {card.label}
              </p>

              {/* Blurred prediction content */}
              <div
                style={{ filter: "blur(4px) brightness(0.5) saturate(0.3)" }}
                aria-hidden="true"
                className="pl-2"
              >
                <div
                  className="text-lg font-bold font-[family-name:var(--font-ibm-plex)] tracking-tight mb-0.5"
                  style={{ color: card.color }}
                >
                  {card.driver}
                </div>
                <div className="text-[10px] text-f1-muted font-mono mb-2">{card.team}</div>
                <div className="text-2xl font-[family-name:var(--font-jetbrains)] font-semibold text-f1-text tabular-nums">
                  {card.confidence}
                </div>
                {/* Confidence bar */}
                <div className="mt-2 h-0.5 bg-f1-grid overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: card.confidence,
                      backgroundColor: card.color,
                    }}
                  />
                </div>
              </div>

              {/* Lock overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-f1-dark-2/40">
                <svg
                  className="h-4 w-4 text-f1-grid"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M11 7V5a3 3 0 0 0-6 0v2H4v7h8V7h-1ZM7 5a1 1 0 1 1 2 0v2H7V5Z" />
                </svg>
              </div>
            </div>
          ))}
        </div>

        {/* Strategy Recommendation panel — blurred */}
        <div className="pred-strategy border border-f1-grid bg-f1-dark-2 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-widest text-f1-muted">
              Strategy Recommendation
            </span>
            <span className="text-[9px] font-mono text-f1-grid">AI-generated · updated each lap</span>
          </div>

          {/* Blurred mock strategy content */}
          <div
            style={{ filter: "blur(5px) brightness(0.5) saturate(0.3)" }}
            aria-hidden="true"
            className="space-y-2"
          >
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-f1-orange uppercase tracking-wider w-16">
                Lap 28
              </span>
              <div className="h-px flex-1 bg-f1-grid" />
              <span className="text-[10px] font-mono text-f1-text">
                Undercut window opens — pit for mediums
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-f1-cyan uppercase tracking-wider w-16">
                Lap 41
              </span>
              <div className="h-px flex-1 bg-f1-grid" />
              <span className="text-[10px] font-mono text-f1-muted">
                Alternative: stay out, target fastest lap on fresh softs at end
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-f1-green uppercase tracking-wider w-16">
                Delta
              </span>
              <div className="h-px flex-1 bg-f1-grid" />
              <span className="text-[10px] font-mono text-f1-green">
                +4.2s net gain on 1-stop vs 2-stop
              </span>
            </div>
          </div>

          {/* Lock overlay */}
          <div className="absolute inset-0 flex items-end justify-end p-3 bg-f1-dark-2/30">
            <span className="text-[9px] font-mono uppercase tracking-widest text-f1-muted flex items-center gap-1">
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M11 7V5a3 3 0 0 0-6 0v2H4v7h8V7h-1ZM7 5a1 1 0 1 1 2 0v2H7V5Z" />
              </svg>
              Phase 2
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
