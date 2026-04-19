"use client";

import { useRef, useState, useEffect } from "react";
import { gsap, useGSAP, MotionPathPlugin, respectsReducedMotion } from "@/lib/gsap";
import { StatusDot } from "@/components/ui";
import { circuitPaths } from "@/lib/constants/circuits";
import { useCountdown } from "@/lib/hooks/use-countdown";

// Silence unused import lint — plugin registered in lib/gsap.ts
void MotionPathPlugin;

const NEXT_RACE = {
  name: "Miami Grand Prix",
  circuit: "Miami International Autodrome",
  round: 5,
  date: "2026-05-03",
};

// Archive mock data — last session (Bahrain GP R04)
const ARCHIVE_SESSION = "BAHRAIN GRAND PRIX · R04";

const ARCHIVE_GAPS = [
  { pos: "P1", code: "VER", gap: "+0.000", team: "#3671C6" },
  { pos: "P2", code: "NOR", gap: "+12.4s", team: "#FF8000" },
  { pos: "P3", code: "ANT", gap: "+18.7s", team: "#27F4D2" },
  { pos: "P4", code: "PIA", gap: "+24.1s", team: "#FF8000" },
  { pos: "P5", code: "HAM", gap: "+31.2s", team: "#E8002D" },
];

const ARCHIVE_TYRES = [
  { compound: "SOFT",   color: "#DC0000", drivers: "HAM · NOR · RUS" },
  { compound: "MEDIUM", color: "#FFED00", drivers: "VER · ANT · PIA" },
  { compound: "HARD",   color: "#E5E5E5", drivers: "ALO · TSU · SAI" },
];

const ARCHIVE_POSITIONS = [
  { code: "VER", start: "P2", finish: "P1", gain: "+1", team: "#3671C6" },
  { code: "NOR", start: "P4", finish: "P2", gain: "+2", team: "#FF8000" },
  { code: "ANT", start: "P1", finish: "P3", gain: "-2", team: "#27F4D2" },
  { code: "PIA", start: "P5", finish: "P4", gain: "+1", team: "#FF8000" },
  { code: "HAM", start: "P3", finish: "P5", gain: "-2", team: "#E8002D" },
];

const ARCHIVE_RADIO = [
  { driver: "NOR", msg: "Copy that, box box, box box." },
  { driver: "VER", msg: "The car feels amazing today, mega." },
  { driver: "ANT", msg: "I had a snap at the exit, push tyres." },
];

// Email validation
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function CountdownBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center border border-f1-grid bg-f1-dark-2 px-4 py-3 min-w-[72px]">
      <span className="text-4xl md:text-5xl font-[family-name:var(--font-jetbrains)] tabular-nums font-semibold text-f1-cyan leading-none">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-f1-muted mt-1.5">{label}</span>
    </div>
  );
}

function ArchiveWatermark({ session }: { session: string }) {
  return (
    <span className="absolute top-2 right-2 text-[8px] font-mono uppercase tracking-widest text-f1-grid/60 pointer-events-none select-none">
      REPLAY · {session}
    </span>
  );
}

export default function LivePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const carRef = useRef<SVGCircleElement>(null);
  const countdown = useCountdown(NEXT_RACE.date);

  // Notify-me form state
  const [email, setEmail] = useState("");
  const [notifyStatus, setNotifyStatus] = useState<"idle" | "submitting" | "done">(() => {
    if (typeof window !== "undefined" && localStorage.getItem("pitwall-notify")) return "done";
    return "idle";
  });

  const handleNotify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) return;
    setNotifyStatus("submitting");
    setTimeout(() => {
      if (typeof window !== "undefined") localStorage.setItem("pitwall-notify", email);
      setNotifyStatus("done");
    }, 1200);
  };

  useGSAP(
    () => {
      if (respectsReducedMotion()) return;

      // Breathing AWAITING text
      gsap.to(".awaiting-text", {
        opacity: 0.3, duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: 0.4,
      });

      // Page entrance
      const tl = gsap.timeline();
      tl.from(".live-status",    { opacity: 0, y: -8, duration: 0.3, ease: "pitwall-accel" })
        .from(".live-countdown", { opacity: 0, y: 12, duration: 0.4, ease: "pitwall-accel" }, "-=0.1")
        .from(".live-circuit",   { opacity: 0,        duration: 0.5 }, "-=0.15")
        .from(".live-panel",     { opacity: 0, y: 12, stagger: 0.07, duration: 0.3, ease: "pitwall-accel" }, "-=0.2")
        .from(".live-notify",    { opacity: 0, y: 8,  duration: 0.3, ease: "pitwall-accel" }, "-=0.1");

      // Ghost car — MotionPath along Miami circuit
      if (carRef.current) {
        gsap.to(carRef.current, {
          duration: 16,
          ease: "none",
          repeat: -1,
          motionPath: {
            path: "#miami-track",
            align: "#miami-track",
            autoRotate: false,
            alignOrigin: [0.5, 0.5],
            start: 0,
            end: 1,
          },
        });
      }
    },
    { scope: containerRef }
  );

  const cd = countdown ?? { days: 0, hours: 0, minutes: 0, seconds: 0 };

  return (
    <div ref={containerRef} className="p-6 lg:p-8 space-y-5">

      {/* Status bar */}
      <div className="live-status flex flex-wrap items-center justify-between gap-3 border border-f1-grid bg-f1-dark-2 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <StatusDot variant="caution" pulse />
          <span className="awaiting-text text-[10px] font-mono uppercase tracking-[0.2em] text-f1-yellow">
            Awaiting Live Session
          </span>
          <span className="text-[10px] font-mono text-f1-muted hidden sm:inline">
            · Connects automatically during race weekends
          </span>
        </div>
        <span className="text-[9px] font-mono uppercase tracking-widest text-f1-grid">
          Phase 3 — Live Race Dashboard
        </span>
      </div>

      {/* Hero: countdown + circuit side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Left: countdown */}
        <div className="live-countdown border border-f1-grid bg-f1-dark-2 p-5 flex flex-col justify-between">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-f1-muted mb-1">
              Round {NEXT_RACE.round} · Next Race
            </p>
            <h2 className="text-xl font-bold font-[family-name:var(--font-ibm-plex)] tracking-tight text-f1-text">
              {NEXT_RACE.name}
            </h2>
            <p className="text-[10px] font-mono text-f1-muted mt-0.5">{NEXT_RACE.circuit}</p>
          </div>

          <div className="my-5">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-f1-muted mb-3">Session starts in</p>
            <div className="flex items-end gap-2 flex-wrap">
              <CountdownBlock value={cd.days}    label="Days" />
              <span className="text-f1-cyan font-[family-name:var(--font-jetbrains)] text-3xl pb-3 leading-none">:</span>
              <CountdownBlock value={cd.hours}   label="Hrs" />
              <span className="text-f1-cyan font-[family-name:var(--font-jetbrains)] text-3xl pb-3 leading-none">:</span>
              <CountdownBlock value={cd.minutes} label="Min" />
              <span className="text-f1-cyan font-[family-name:var(--font-jetbrains)] text-3xl pb-3 leading-none">:</span>
              <CountdownBlock value={cd.seconds} label="Sec" />
            </div>
          </div>

          <div className="border-t border-f1-grid pt-3 space-y-1">
            {[
              { label: "FP1 / FP2",  time: "02 May · 08:30 / 12:00 UTC" },
              { label: "FP3 / QUAL", time: "03 May · 09:00 / 12:00 UTC" },
              { label: "RACE",       time: "04 May · 15:00 UTC" },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-[9px] font-mono uppercase tracking-widest text-f1-muted">{s.label}</span>
                <span className="text-[9px] font-[family-name:var(--font-jetbrains)] tabular-nums text-f1-grid">{s.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Miami circuit with ghost car */}
        <div className="live-circuit border border-f1-grid bg-f1-dark-2 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-widest text-f1-muted">
              Circuit Preview
            </span>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-f1-cyan animate-pulse" aria-hidden="true" />
              <span className="text-[9px] font-mono text-f1-cyan uppercase tracking-widest">Ghost Lap</span>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center min-h-[200px]">
            <svg
              viewBox={circuitPaths.miami.viewBox}
              className="w-full max-h-[260px]"
              aria-label="Miami International Autodrome circuit layout"
            >
              <defs>
                <filter id="car-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Outer cased line */}
              <path
                d={circuitPaths.miami.d}
                stroke="var(--color-f1-cyan)"
                strokeWidth="5"
                strokeOpacity={0.12}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Inner dark channel */}
              <path
                d={circuitPaths.miami.d}
                stroke="#0F0F0F"
                strokeWidth="2.5"
                strokeOpacity={1}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Visible track line */}
              <path
                id="miami-track"
                d={circuitPaths.miami.d}
                stroke="var(--color-f1-cyan)"
                strokeWidth="1.5"
                strokeOpacity={0.35}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Ghost car dot */}
              <circle
                ref={carRef}
                r="5"
                fill="var(--color-f1-cyan)"
                filter="url(#car-glow)"
                aria-hidden="true"
              />
            </svg>
          </div>

          <div className="border-t border-f1-grid pt-2 flex items-center justify-between">
            <span className="text-[9px] font-mono text-f1-muted uppercase tracking-widest">
              Miami International Autodrome
            </span>
            <span className="text-[9px] font-[family-name:var(--font-jetbrains)] tabular-nums text-f1-grid">
              5.412 km · 19 turns
            </span>
          </div>
        </div>
      </div>

      {/* Archive panels — 2×2 with last-session mock data */}
      <div>
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-f1-grid mb-2">
          Last Session Data — replay only
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Gap to Leader */}
          <div className="live-panel border border-f1-grid bg-f1-dark-2 relative">
            <ArchiveWatermark session={ARCHIVE_SESSION} />
            <div className="flex items-center gap-2 border-b border-f1-grid px-3 py-2">
              <StatusDot variant="offline" />
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-f1-muted">Gap to Leader</span>
            </div>
            <div className="px-3 py-3 space-y-1.5">
              {ARCHIVE_GAPS.map(row => (
                <div key={row.code} className="flex items-center gap-2">
                  <div className="w-0.5 h-3.5 flex-shrink-0" style={{ backgroundColor: row.team }} />
                  <span className="text-[10px] font-[family-name:var(--font-jetbrains)] text-f1-muted w-6 tabular-nums">{row.pos}</span>
                  <span className="text-[10px] font-[family-name:var(--font-jetbrains)] text-f1-text font-semibold w-8 tracking-wider">{row.code}</span>
                  <span className="text-[10px] font-[family-name:var(--font-jetbrains)] tabular-nums text-f1-muted ml-auto">{row.gap}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tyre Strategy */}
          <div className="live-panel border border-f1-grid bg-f1-dark-2 relative">
            <ArchiveWatermark session={ARCHIVE_SESSION} />
            <div className="flex items-center gap-2 border-b border-f1-grid px-3 py-2">
              <StatusDot variant="offline" />
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-f1-muted">Tyre Strategy</span>
            </div>
            <div className="px-3 py-3 space-y-2.5">
              {ARCHIVE_TYRES.map(row => (
                <div key={row.compound}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} aria-hidden="true" />
                    <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: row.color }}>{row.compound}</span>
                  </div>
                  <span className="text-[9px] font-mono text-f1-muted pl-4 tracking-wide">{row.drivers}</span>
                </div>
              ))}
              <p className="awaiting-text text-[9px] font-mono text-f1-grid uppercase tracking-[0.15em] pt-1 border-t border-f1-grid/40">
                Live strategy · offline
              </p>
            </div>
          </div>

          {/* Position Tracker */}
          <div className="live-panel border border-f1-grid bg-f1-dark-2 relative">
            <ArchiveWatermark session={ARCHIVE_SESSION} />
            <div className="flex items-center gap-2 border-b border-f1-grid px-3 py-2">
              <StatusDot variant="offline" />
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-f1-muted">Position Changes</span>
            </div>
            <div className="px-3 py-3 space-y-1.5">
              {ARCHIVE_POSITIONS.map(row => (
                <div key={row.code} className="flex items-center gap-2">
                  <div className="w-0.5 h-3.5 flex-shrink-0" style={{ backgroundColor: row.team }} />
                  <span className="text-[10px] font-[family-name:var(--font-jetbrains)] font-semibold text-f1-text w-8 tracking-wider">{row.code}</span>
                  <span className="text-[9px] font-mono text-f1-muted">{row.start} → {row.finish}</span>
                  <span
                    className="text-[10px] font-[family-name:var(--font-jetbrains)] tabular-nums ml-auto"
                    style={{ color: row.gain.startsWith("+") ? "var(--color-f1-green)" : "var(--color-f1-red)" }}
                  >
                    {row.gain}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Team Radio */}
          <div className="live-panel border border-f1-grid bg-f1-dark-2 relative">
            <ArchiveWatermark session={ARCHIVE_SESSION} />
            <div className="flex items-center gap-2 border-b border-f1-grid px-3 py-2">
              <StatusDot variant="offline" />
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-f1-muted">Team Radio</span>
            </div>
            <div className="px-3 py-3 space-y-2.5">
              {ARCHIVE_RADIO.map((msg, i) => (
                <div key={i}>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-f1-cyan">{msg.driver}</span>
                  <p className="text-[10px] font-mono text-f1-muted mt-0.5 leading-relaxed">"{msg.msg}"</p>
                </div>
              ))}
              <p className="awaiting-text text-[9px] font-mono text-f1-grid uppercase tracking-[0.15em] pt-1 border-t border-f1-grid/40">
                Live feed · offline
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Notify me — primary audience capture */}
      <div className="live-notify border border-f1-cyan/20 bg-f1-dark-2 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-f1-cyan mb-1">
              Signal Subscription
            </p>
            <h3 className="text-base font-semibold font-[family-name:var(--font-ibm-plex)] text-f1-text">
              Get notified when the live dashboard goes active
            </h3>
            <p className="text-[11px] font-mono text-f1-muted mt-0.5">
              We'll ping you when Phase 3 ships — and automatically before each race weekend.
            </p>
          </div>

          {notifyStatus === "done" ? (
            <div className="flex items-center gap-2 flex-shrink-0 border border-f1-green/30 bg-f1-green/5 px-4 py-2.5">
              <StatusDot variant="live" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-f1-green">
                Signal Confirmed
              </span>
            </div>
          ) : (
            <form onSubmit={handleNotify} className="flex gap-2 flex-shrink-0 w-full sm:w-auto">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={notifyStatus === "submitting"}
                className="flex-1 sm:w-52 bg-f1-dark border border-f1-grid px-3 py-2 text-[11px] font-mono text-f1-text placeholder:text-f1-grid focus:outline-none focus:border-f1-cyan/50 disabled:opacity-50"
                aria-label="Email address for race notifications"
              />
              <button
                type="submit"
                disabled={notifyStatus === "submitting" || !isValidEmail(email)}
                className="flex-shrink-0 bg-f1-red text-f1-text text-[10px] font-mono uppercase tracking-widest px-4 py-2 cursor-pointer hover:bg-red-600 transition-colors duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {notifyStatus === "submitting" ? "Transmitting…" : "Notify Me"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
