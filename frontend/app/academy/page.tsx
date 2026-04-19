"use client";

import { useRef } from "react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { Lock } from "lucide-react";

// 20 segments — 1 filled = 5% (teaser: something is there)
const TOTAL_SEGMENTS = 20;
const FILLED_SEGMENTS = 1;

const MODULES = [
  {
    topic: "Race Format",
    title: "Race Weekend Format",
    tag: "Foundations",
    lessons: 5,
  },
  {
    topic: "Tyre Strategy",
    title: "Compounds, Degradation & Pit Windows",
    tag: "Strategy",
    lessons: 4,
  },
  {
    topic: "Aerodynamics",
    title: "Downforce, Drag & DRS",
    tag: "Engineering",
    lessons: 6,
  },
  {
    topic: "Regulations",
    title: "Budget Cap, Power Units & Penalties",
    tag: "Rules",
    lessons: 7,
  },
  {
    topic: "Flag Signals",
    title: "Flag Regulations & Race Control",
    tag: "Foundations",
    lessons: 3,
  },
  {
    topic: "Points System",
    title: "Championship Points & Tiebreakers",
    tag: "Foundations",
    lessons: 2,
  },
] as const;

const TAG_COLORS: Record<string, string> = {
  Foundations: "#00C0FF",
  Strategy: "#FF8000",
  Engineering: "#27F4D2",
  Rules: "#FFED00",
};

export default function AcademyPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (respectsReducedMotion()) {
        // Snap: show filled segments immediately
        gsap.set(".seg-filled", { opacity: 1 });
        gsap.set(".module-card", { opacity: 1, y: 0 });
        return;
      }

      // Segmented bar: all segments reveal (stagger), filled ones glow cyan
      const tl = gsap.timeline({ delay: 0.4 });
      tl.from(".seg-unit", {
        opacity: 0,
        scaleX: 0,
        stagger: { each: 0.04, from: "start" },
        duration: 0.2,
        ease: "pitwall-accel",
        transformOrigin: "left center",
      }).from(
        ".seg-filled",
        {
          opacity: 0,
          duration: 0.3,
          ease: "pitwall-accel",
          stagger: 0.1,
        },
        "-=0.3"
      );

      // Module cards: stagger entrance
      gsap.from(".module-card", {
        opacity: 0,
        y: 12,
        stagger: 0.07,
        duration: 0.35,
        ease: "pitwall-accel",
        delay: 0.8,
      });

      // Gentle pulse on locked cards — breathing to indicate "loading"
      gsap.to(".module-card", {
        opacity: 0.72,
        duration: 2.0,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        stagger: 0.35,
        delay: 1.5,
      });
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef} className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-f1-muted mb-1">
            Phase 4 · Not yet active
          </p>
          <h1 className="text-2xl font-bold tracking-tight font-[family-name:var(--font-ibm-plex)]">
            F1 Academy
          </h1>
        </div>
        <div className="flex-shrink-0 border border-f1-grid bg-f1-dark-2 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-f1-muted">
          Interactive Modules
          <br />
          <span className="text-f1-grid">Quiz Engine</span>
        </div>
      </div>

      {/* Segmented progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-f1-muted">
            Training Progress
          </span>
          <span className="text-[10px] font-[family-name:var(--font-jetbrains)] tabular-nums text-f1-muted">
            {FILLED_SEGMENTS}/{TOTAL_SEGMENTS} modules
          </span>
        </div>

        {/* Segmented bar */}
        <div className="flex gap-0.5 h-2" role="progressbar" aria-valuenow={5} aria-valuemin={0} aria-valuemax={100} aria-label="Academy progress: 5%">
          {Array.from({ length: TOTAL_SEGMENTS }, (_, i) => {
            const filled = i < FILLED_SEGMENTS;
            return (
              <div
                key={i}
                className={`seg-unit flex-1 relative ${filled ? "" : "bg-f1-grid/40"}`}
              >
                {filled && (
                  <div
                    className="seg-filled absolute inset-0 bg-f1-cyan"
                    style={{
                      boxShadow: "0 0 6px rgba(0, 192, 255, 0.5)",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[9px] font-mono text-f1-grid uppercase tracking-[0.15em]">
          5% complete — unlock modules when Phase 4 ships
        </p>
      </div>

      {/* Module grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {MODULES.map((module) => {
          const tagColor = TAG_COLORS[module.tag] ?? "#A3A3A3";
          return (
            <div
              key={module.topic}
              className="module-card border border-f1-grid bg-f1-dark-2 p-4 relative"
            >
              {/* Top row: tag + lock */}
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 border"
                  style={{
                    color: tagColor,
                    borderColor: `${tagColor}40`,
                    backgroundColor: `${tagColor}10`,
                  }}
                >
                  {module.tag}
                </span>
                <Lock className="h-3.5 w-3.5 text-f1-grid" aria-hidden="true" />
              </div>

              {/* Blurred title + description */}
              <div
                style={{ filter: "blur(3px) brightness(0.5) saturate(0.2)" }}
                aria-hidden="true"
                className="mb-3"
              >
                <h3 className="font-semibold text-sm font-[family-name:var(--font-ibm-plex)] leading-snug text-f1-text mb-1">
                  {module.title}
                </h3>
                <p className="text-[10px] font-mono text-f1-muted">
                  {module.lessons} lessons · ~{module.lessons * 4} min
                </p>
              </div>

              {/* Accessible label beneath blur */}
              <p className="text-[10px] font-mono text-f1-grid uppercase tracking-[0.1em]">
                {module.topic}
              </p>

              {/* Bottom: lesson count */}
              <div className="mt-3 flex items-center gap-2">
                {Array.from({ length: Math.min(module.lessons, 7) }, (_, i) => (
                  <div
                    key={i}
                    className="h-0.5 flex-1 bg-f1-grid/50"
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom hint */}
      <div className="border border-f1-grid/40 bg-f1-dark-2/40 px-4 py-3 flex items-center gap-3">
        <div className="h-2 w-2 rounded-full bg-f1-grid flex-shrink-0" aria-hidden="true" />
        <p className="text-[10px] font-mono text-f1-muted uppercase tracking-[0.15em]">
          Phase 4 — Interactive learning modules, quiz engine, and achievement system
        </p>
      </div>
    </div>
  );
}
