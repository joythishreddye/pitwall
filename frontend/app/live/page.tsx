"use client";

import { useRef } from "react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { StatusDot } from "@/components/ui";
import { DrawPath } from "@/components/ui/draw-path";
import { circuitPaths } from "@/lib/constants/circuits";
import { useCountdown } from "@/lib/hooks/use-countdown";

// Hardcoded next session — Miami Grand Prix 2026
const NEXT_SESSION = {
  name: "Miami Grand Prix",
  circuit: "Miami International Autodrome",
  date: "2026-05-03",
};

const PANELS = [
  {
    id: "gap",
    title: "Gap to Leader",
    icon: "△",
    rows: ["VER", "ANT", "PIA", "HAM", "NOR"],
    gaps: ["+0.000", "+1.342", "+3.218", "+5.461", "+8.103"],
  },
  {
    id: "tyre",
    title: "Tyre Strategy",
    icon: "◎",
    rows: ["Soft", "Medium", "Hard", "Inter", "Wet"],
    laps: ["—", "—", "—", "—", "—"],
  },
  {
    id: "positions",
    title: "Position Tracker",
    icon: "↑",
    rows: ["P1", "P2", "P3", "P4", "P5"],
    drivers: ["—", "—", "—", "—", "—"],
  },
  {
    id: "radio",
    title: "Team Radio",
    icon: "◈",
    messages: [
      "Standby — session not active",
      "——————————————",
      "——————————————",
    ],
  },
] as const;

function PanelBody({ panel }: { panel: (typeof PANELS)[number] }) {
  if (panel.id === "radio") {
    return (
      <div className="space-y-2 pt-1">
        {panel.messages.map((msg, i) => (
          <p
            key={i}
            className="text-[10px] font-mono text-f1-muted tracking-wider leading-relaxed"
          >
            {msg}
          </p>
        ))}
        <div className="awaiting-text text-[10px] font-mono text-f1-grid uppercase tracking-[0.2em] pt-2">
          Awaiting transmission
        </div>
      </div>
    );
  }

  const rows = "rows" in panel ? panel.rows : [];

  return (
    <div className="space-y-1.5 pt-1">
      {rows.map((row, i) => (
        <div
          key={row}
          className="flex items-center justify-between"
        >
          <span className="text-[10px] font-[family-name:var(--font-jetbrains)] text-f1-muted tracking-widest">
            {row}
          </span>
          <span className="text-[10px] font-[family-name:var(--font-jetbrains)] text-f1-grid tabular-nums">
            {"gaps" in panel
              ? panel.gaps[i]
              : "laps" in panel
                ? panel.laps[i]
                : "drivers" in panel
                  ? panel.drivers[i]
                  : "—"}
          </span>
        </div>
      ))}
      <div className="awaiting-text text-[9px] font-mono text-f1-grid uppercase tracking-[0.2em] pt-2 border-t border-f1-grid/40">
        Live data offline
      </div>
    </div>
  );
}

export default function LivePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const countdown = useCountdown(NEXT_SESSION.date);

  useGSAP(
    () => {
      if (respectsReducedMotion()) return;

      // Breathing AWAITING animation — organic sine wave opacity
      gsap.to(".awaiting-text", {
        opacity: 0.3,
        duration: 1.4,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        stagger: 0.4,
      });

      // Page entrance timeline
      const tl = gsap.timeline();
      tl.from(".live-status-bar", { opacity: 0, y: -8, duration: 0.3, ease: "pitwall-accel" })
        .from(".live-panel", { opacity: 0, y: 12, stagger: 0.08, duration: 0.35, ease: "pitwall-accel" }, "-=0.1");
    },
    { scope: containerRef }
  );

  const countdownStr = countdown
    ? `${countdown.days}D ${String(countdown.hours).padStart(2, "0")}H ${String(countdown.minutes).padStart(2, "0")}M`
    : "—";

  return (
    <div ref={containerRef} className="relative min-h-[calc(100vh-4rem)] p-6 lg:p-8">
      {/* Ambient circuit background — Suzuka, very faint, slow loop */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden" aria-hidden="true">
        <DrawPath
          d={circuitPaths.suzuka.d}
          viewBox={circuitPaths.suzuka.viewBox}
          color="var(--color-f1-cyan)"
          strokeWidth={1.2}
          duration={8}
          loop={true}
          className="w-[70%] max-w-2xl opacity-[0.055]"
        />
      </div>

      {/* Status bar */}
      <div className="live-status-bar relative z-10 mb-6 border border-f1-grid bg-f1-dark-2/80 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <StatusDot variant="caution" pulse />
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-f1-yellow">
                Awaiting Live Session
              </p>
              <p className="text-[11px] font-mono text-f1-muted mt-0.5">
                Connects automatically during race weekends
              </p>
            </div>
          </div>

          <div className="border-l border-f1-grid pl-4">
            <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-f1-muted mb-0.5">
              Next Session
            </p>
            <p className="text-[11px] font-[family-name:var(--font-ibm-plex)] font-semibold text-f1-text">
              {NEXT_SESSION.name}
            </p>
            <p className="text-[10px] font-[family-name:var(--font-jetbrains)] text-f1-cyan tabular-nums mt-0.5">
              T-{countdownStr}
            </p>
          </div>
        </div>
      </div>

      {/* 2×2 Panel grid */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PANELS.map((panel) => (
          <div
            key={panel.id}
            className="live-panel border border-f1-grid bg-f1-dark-2/70 backdrop-blur-none"
          >
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-f1-grid px-3 py-2">
              <div className="flex items-center gap-2">
                <StatusDot variant="offline" />
                <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-f1-muted">
                  {panel.title}
                </span>
              </div>
              <span className="text-[10px] font-mono text-f1-grid opacity-50">{panel.icon}</span>
            </div>

            {/* Panel body */}
            <div className="px-3 py-3 min-h-[120px]">
              <PanelBody panel={panel} />
            </div>
          </div>
        ))}
      </div>

      {/* Bottom status strip */}
      <div className="relative z-10 mt-4 border border-f1-grid/40 bg-f1-dark-2/40 px-4 py-2">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="awaiting-text text-[9px] font-mono uppercase tracking-[0.2em] text-f1-grid">
            Feed: Offline
          </span>
          <span className="text-[9px] font-mono text-f1-grid">·</span>
          <span className="awaiting-text text-[9px] font-mono uppercase tracking-[0.2em] text-f1-grid">
            SignalR: Disconnected
          </span>
          <span className="text-[9px] font-mono text-f1-grid">·</span>
          <span className="text-[9px] font-mono text-f1-muted uppercase tracking-[0.2em]">
            Phase 3 — Live Race Dashboard
          </span>
        </div>
      </div>
    </div>
  );
}
