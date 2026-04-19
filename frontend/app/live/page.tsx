"use client";

import { useRef } from "react";
import { gsap, useGSAP, MotionPathPlugin, respectsReducedMotion } from "@/lib/gsap";
import { NotifyForm } from "@/components/ui";
import { circuitPaths } from "@/lib/constants/circuits";

void MotionPathPlugin;

// Blurred mock shapes for each panel — recognisable data silhouettes through the blur
// Gap to Leader: team-color bars at varying lengths
const GAP_BARS = [
  { color: "var(--color-team-red-bull)",  width: "100%", label: "VER" },
  { color: "var(--color-team-mclaren)",   width: "74%",  label: "NOR" },
  { color: "var(--color-team-mercedes)", width: "61%",  label: "ANT" },
  { color: "var(--color-team-mclaren)",   width: "48%",  label: "PIA" },
  { color: "var(--color-team-ferrari)",   width: "35%",  label: "HAM" },
] as const;

// Tyre Strategy: compound-color dots with driver counts
const TYRE_ROWS = [
  { color: "var(--color-f1-red)",    label: "SOFT",   count: 8 },
  { color: "var(--color-f1-yellow)", label: "MEDIUM", count: 7 },
  { color: "var(--color-f1-text)",   label: "HARD",   count: 5 },
] as const;

// Position Changes: mock +/- deltas
const POS_ROWS = [
  { code: "VER", delta: "+3", up: true },
  { code: "NOR", delta: "+1", up: true },
  { code: "ANT", delta: "-2", up: false },
  { code: "PIA", delta: "+2", up: true },
  { code: "HAM", delta: "-1", up: false },
] as const;

// Team Radio: waveform heights
const WAVE_HEIGHTS = [40, 70, 55, 90, 45, 80, 35, 75, 60, 85, 50, 65] as const;

const PANELS = [
  {
    id: "gap",
    label: "Gap to Leader",
    accent: "var(--color-team-mercedes)",
  },
  {
    id: "tyre",
    label: "Tyre Strategy",
    accent: "var(--color-f1-yellow)",
  },
  {
    id: "positions",
    label: "Position Changes",
    accent: "var(--color-f1-green)",
  },
  {
    id: "radio",
    label: "Team Radio",
    accent: "var(--color-team-mclaren)",
  },
] as const;

function PanelMockContent({ id }: { id: string }) {
  if (id === "gap") {
    return (
      <div className="space-y-2 w-full">
        {GAP_BARS.map(row => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="text-[9px] font-mono w-6 flex-shrink-0" style={{ color: row.color }}>{row.label}</span>
            <div className="flex-1 h-1.5 bg-f1-dark-3 overflow-hidden">
              <div className="h-full" style={{ width: row.width, backgroundColor: row.color, opacity: 0.7 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (id === "tyre") {
    return (
      <div className="space-y-3 w-full">
        {TYRE_ROWS.map(row => (
          <div key={row.label} className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
            <span className="text-[9px] font-mono" style={{ color: row.color }}>{row.label}</span>
            <div className="flex gap-0.5 ml-auto">
              {Array.from({ length: row.count }, (_, i) => (
                <div key={i} className="h-2 w-2" style={{ backgroundColor: row.color, opacity: 0.5 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (id === "positions") {
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full">
        {POS_ROWS.map(row => (
          <div key={row.code} className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-f1-text font-semibold">{row.code}</span>
            <span
              className="text-[10px] font-mono font-bold"
              style={{ color: row.up ? "var(--color-f1-green)" : "var(--color-f1-red)" }}
            >
              {row.delta}
            </span>
          </div>
        ))}
      </div>
    );
  }
  // radio — waveform
  return (
    <div className="flex items-end gap-0.5 h-10 w-full">
      {WAVE_HEIGHTS.map((h, i) => (
        <div
          key={i}
          className="flex-1"
          style={{ height: `${h}%`, backgroundColor: "var(--color-f1-orange)", opacity: 0.6 }}
        />
      ))}
    </div>
  );
}

export default function LivePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      if (respectsReducedMotion()) return;

      // Page entrance
      const tl = gsap.timeline();
      tl.from(".live-header",  { opacity: 0, y: -8, duration: 0.3, ease: "pitwall-accel" })
        .from(".live-circuit", { opacity: 0,         duration: 0.5 }, "-=0.1")
        .from(".live-panel",   { opacity: 0, y: 8, stagger: 0.07, duration: 0.3, ease: "pitwall-accel" }, "-=0.15")
        .from(".live-notify",  { opacity: 0, y: 8, duration: 0.3, ease: "pitwall-accel" }, "-=0.1");

      // 5 team-colored dots — staggered positions along the circuit
      // Negative delay = already in progress, so each car starts at a different point
      const LAP_DURATION = 16;
      svgRef.current?.querySelectorAll<SVGCircleElement>(".live-car").forEach((car, i) => {
        gsap.to(car, {
          duration: LAP_DURATION + i * 0.6, // slightly different lap times
          ease: "none",
          repeat: -1,
          delay: -(i * (LAP_DURATION / 5)), // evenly spread around the track
          motionPath: {
            path: "#miami-track",
            align: "#miami-track",
            autoRotate: false,
            alignOrigin: [0.5, 0.5],
            start: 0,
            end: 1,
          },
        });
      });
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef} className="p-6 lg:p-8 space-y-5">

      {/* Minimal header — no dates, no phase messaging */}
      <div className="live-header flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-f1-muted mb-0.5">
            Phase 3 · Not yet active
          </p>
          <h1 className="text-2xl font-bold tracking-tight font-[family-name:var(--font-ibm-plex)]">
            Live Race Dashboard
          </h1>
        </div>
        {/* Pulsing "live" dot — creates impression the system is always on */}
        <div
          role="status"
          aria-live="polite"
          aria-label="System status: awaiting live session"
          className="flex items-center gap-2 border border-f1-grid bg-f1-dark-2 px-3 py-1.5"
        >
          <span aria-hidden="true" className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-f1-green opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-f1-green" style={{ boxShadow: "0 0 6px rgba(0,255,0,0.6)" }} />
          </span>
          <span className="text-[9px] font-mono uppercase tracking-widest text-f1-green">Live</span>
        </div>
      </div>

      {/* Circuit hero — blurred with team-colored tracking dots */}
      <div className="live-circuit border border-f1-grid bg-f1-dark-2 p-4 relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-f1-muted">
            {circuitPaths.miami.name}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-f1-cyan animate-pulse" aria-hidden="true" />
            <span className="text-[9px] font-mono text-f1-cyan uppercase tracking-widest">Tracking</span>
          </div>
        </div>

        {/* Blurred circuit + colored dots — matches predictions chart treatment */}
        <div
          style={{ filter: "blur(4px) brightness(0.55) saturate(0.5)" }}
          aria-hidden="true"
        >
          <svg
            ref={svgRef}
            viewBox="30 130 460 280"
            className="w-full max-h-[220px]"
          >
            {/* Outer cased stroke */}
            <path d={circuitPaths.miami.d} stroke="var(--color-f1-cyan)" strokeWidth="7" strokeOpacity={0.15} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {/* Dark inner channel */}
            <path d={circuitPaths.miami.d} stroke="#0F0F0F" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {/* Track line — motionPath target */}
            <path id="miami-track" d={circuitPaths.miami.d} stroke="var(--color-f1-cyan)" strokeWidth="1.5" strokeOpacity={0.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {/* 5 team-colored tracking dots */}
            <circle className="live-car" r="7" fill="#3671C6" />
            <circle className="live-car" r="7" fill="#FF8000" />
            <circle className="live-car" r="7" fill="#27F4D2" />
            <circle className="live-car" r="7" fill="#E8002D" />
            <circle className="live-car" r="7" fill="#229971" />
          </svg>
        </div>

        {/* Lock label — outside blur, same style as panels */}
        <div className="absolute inset-0 flex items-end justify-end p-3 pointer-events-none">
          <span className="text-[9px] font-mono uppercase tracking-widest text-f1-muted flex items-center gap-1">
            <LockIcon />
            Phase 3
          </span>
        </div>
      </div>

      {/* Data panels — styled exactly like prediction cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {PANELS.map(panel => (
          <div
            key={panel.id}
            className="live-panel border border-f1-grid bg-f1-dark-2 p-4 relative overflow-hidden"
          >
            {/* Left accent border — same treatment as prediction cards */}
            <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: panel.accent }} />

            <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-f1-muted mb-3 pl-2">
              {panel.label}
            </p>

            {/* Blurred mock content — shapes are recognisable, values are not */}
            <div
              style={{ filter: "blur(4px) brightness(0.55) saturate(0.35)" }}
              aria-hidden="true"
              className="pl-2"
            >
              <PanelMockContent id={panel.id} />
            </div>

            {/* Lock overlay */}
            <div className="absolute inset-0 flex items-end justify-end p-3 bg-f1-dark-2/40">
              <span className="text-[9px] font-mono uppercase tracking-widest text-f1-muted flex items-center gap-1">
                <LockIcon />
                Phase 3
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Notify me */}
      <div className="live-notify border border-f1-cyan/20 bg-f1-dark-2 p-5">
        <NotifyForm
          source="live"
          heading="Get notified when the live dashboard ships"
          description="We'll ping you when Phase 3 is ready."
        />
      </div>

    </div>
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-3 w-3 ${className}`} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M11 7V5a3 3 0 0 0-6 0v2H4v7h8V7h-1ZM7 5a1 1 0 1 1 2 0v2H7V5Z" />
    </svg>
  );
}
