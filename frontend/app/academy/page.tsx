"use client";

import { useRef } from "react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { Lock } from "lucide-react";
import Link from "next/link";

const TOTAL_SEGMENTS = 20;
const FILLED_SEGMENTS = 1;

const MODULES = [
  {
    topic: "Race Format",
    title: "Race Weekend Format",
    preview: "From free practice to the chequered flag — how each session shapes the race outcome and championship points.",
    tag: "Fundamentals",
    tagColor: "#00C0FF",
    lessons: 5,
  },
  {
    topic: "Tyre Strategy",
    title: "Compounds, Degradation & Pit Windows",
    preview: "Why do teams pit when they do? Undercuts, overcuts, and the art of the 2-stop in a safety-car race.",
    tag: "Strategy",
    tagColor: "#FF8000",
    lessons: 4,
  },
  {
    topic: "Aerodynamics",
    title: "Downforce, Drag & DRS",
    preview: "How air becomes a weapon — the physics of cornering grip, straight-line speed, and the DRS detection zone.",
    tag: "Engineering",
    tagColor: "#27F4D2",
    lessons: 6,
  },
  {
    topic: "Regulations",
    title: "Budget Cap, Power Units & Penalties",
    preview: "The rulebook that shapes every car, every strategy call, and every grid penalty you've ever seen.",
    tag: "Rules",
    tagColor: "#FFED00",
    lessons: 7,
  },
  {
    topic: "Flag Signals",
    title: "Flags, Safety Car & Race Control",
    preview: "Yellow, red, black-and-white — what every flag means and how Race Control orchestrates 20 cars at 300km/h.",
    tag: "Race Control",
    tagColor: "#FF6B00",
    lessons: 3,
  },
  {
    topic: "Championship",
    title: "How the Championship is Won",
    preview: "Points, dropped scores, Constructors' standings — the maths behind a title fight that goes to Abu Dhabi.",
    tag: "Championships",
    tagColor: "#FFD700",
    lessons: 4,
  },
] as const;

export default function AcademyPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (respectsReducedMotion()) {
        gsap.set(".seg-filled", { opacity: 1 });
        gsap.set(".module-card", { opacity: 1, y: 0 });
        return;
      }

      // Segmented bar reveal
      const tl = gsap.timeline({ delay: 0.4 });
      tl.from(".seg-unit", {
        opacity: 0, scaleX: 0,
        stagger: { each: 0.04, from: "start" },
        duration: 0.2, ease: "pitwall-accel",
        transformOrigin: "left center",
      }).from(".seg-filled", {
        opacity: 0, duration: 0.35, ease: "pitwall-accel", stagger: 0.1,
      }, "-=0.3");

      // Module card entrance + slow pulse
      gsap.from(".module-card", {
        opacity: 0, y: 12, stagger: 0.07, duration: 0.35, ease: "pitwall-accel", delay: 0.8,
      });
      gsap.to(".module-card", {
        opacity: 0.74, duration: 2.1, ease: "sine.inOut",
        yoyo: true, repeat: -1, stagger: 0.35, delay: 1.6,
      });
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef} className="p-6 lg:p-8 space-y-6">

      {/* Header + stats strip */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-f1-muted mb-1">
              Phase 4 · Not yet active
            </p>
            <h1 className="text-2xl font-bold tracking-tight font-[family-name:var(--font-ibm-plex)]">
              F1 Academy
            </h1>
          </div>
          <div className="flex-shrink-0 border border-f1-grid bg-f1-dark-2 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-f1-muted text-right">
            Interactive Modules
            <br />
            <span className="text-f1-grid">Quiz Engine</span>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border border-f1-grid divide-x divide-f1-grid">
          {[
            { value: "6",     label: "Modules" },
            { value: "29",    label: "Lessons" },
            { value: "40+",   label: "Quiz Questions" },
            { value: "~3.5h", label: "Est. Total" },
          ].map(stat => (
            <div key={stat.label} className="px-4 py-2.5 text-center">
              <div className="text-lg font-[family-name:var(--font-jetbrains)] font-semibold tabular-nums text-f1-text">
                {stat.value}
              </div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-f1-muted mt-0.5">
                {stat.label}
              </div>
            </div>
          ))}
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

        <div
          className="flex gap-0.5 h-2"
          role="progressbar"
          aria-valuenow={5}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Academy progress: 5%"
        >
          {Array.from({ length: TOTAL_SEGMENTS }, (_, i) => {
            const filled = i < FILLED_SEGMENTS;
            return (
              <div key={i} className={`seg-unit flex-1 relative ${filled ? "" : "bg-f1-grid/40"}`}>
                {filled && (
                  <div
                    className="seg-filled absolute inset-0 bg-f1-cyan"
                    style={{ boxShadow: "0 0 6px rgba(0,192,255,0.5)" }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[9px] font-mono text-f1-grid uppercase tracking-[0.15em]">
          5% complete — modules unlock when Phase 4 ships
        </p>
      </div>

      {/* Module grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {MODULES.map((module) => (
          <div key={module.topic} className="module-card border border-f1-grid bg-f1-dark-2 p-4 relative">

            {/* Top: tag + lock */}
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 border"
                style={{
                  color: module.tagColor,
                  borderColor: `${module.tagColor}40`,
                  backgroundColor: `${module.tagColor}10`,
                }}
              >
                {module.tag}
              </span>
              <Lock className="h-3.5 w-3.5 text-f1-grid" aria-hidden="true" />
            </div>

            {/* Blurred title + preview */}
            <div
              style={{ filter: "blur(3px) brightness(0.5) saturate(0.2)" }}
              aria-hidden="true"
              className="mb-3 space-y-1"
            >
              <h3 className="font-semibold text-sm font-[family-name:var(--font-ibm-plex)] leading-snug text-f1-text">
                {module.title}
              </h3>
              <p className="text-[10px] font-mono text-f1-muted leading-relaxed line-clamp-2">
                {module.preview}
              </p>
            </div>

            {/* Accessible topic label (not blurred) */}
            <p className="text-[10px] font-mono text-f1-grid uppercase tracking-[0.1em]">
              {module.topic}
            </p>

            {/* Lesson count bar */}
            <div className="mt-3 flex items-center gap-1">
              {Array.from({ length: Math.min(module.lessons, 7) }, (_, i) => (
                <div key={i} className="h-0.5 flex-1 bg-f1-grid/50" aria-hidden="true" />
              ))}
              <span className="text-[9px] font-[family-name:var(--font-jetbrains)] tabular-nums text-f1-grid ml-1">
                {module.lessons}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Notify CTA — softer, links to /live */}
      <div className="border border-f1-grid/40 bg-f1-dark-2/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-f1-muted mb-0.5">
            Want early access?
          </p>
          <p className="text-[11px] font-mono text-f1-muted">
            Leave your email on the Live page — we'll notify you when Academy and all features ship.
          </p>
        </div>
        <Link
          href="/live#notify"
          className="flex-shrink-0 border border-f1-grid px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-f1-muted hover:border-f1-cyan/40 hover:text-f1-cyan transition-colors duration-100 text-center"
        >
          Get Notified →
        </Link>
      </div>

    </div>
  );
}
