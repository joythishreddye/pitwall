"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { SplitReveal } from "@/components/ui/split-reveal";
import type { DriverProfile } from "@/lib/schemas/drivers";

interface ProfileHeaderProps {
  driver: DriverProfile;
  teamColor: string;
  teamHex: string;
  headshotUrl: string | null;
}

export function ProfileHeader({ driver, teamColor, teamHex, headshotUrl }: ProfileHeaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  // Team-color glow fades in on load
  useGSAP(
    () => {
      if (!glowRef.current) return;
      if (respectsReducedMotion()) {
        gsap.set(glowRef.current, { opacity: 0.12 });
        return;
      }
      gsap.fromTo(
        glowRef.current,
        { opacity: 0 },
        { opacity: 0.12, duration: 0.8, ease: "pitwall-accel" }
      );
    },
    { scope: containerRef, dependencies: [teamHex] }
  );

  const fullName = `${driver.forename.toUpperCase()} ${driver.surname.toUpperCase()}`;
  const initials = `${driver.forename[0] ?? "?"}${driver.surname[0] ?? "?"}`;
  const showPhoto = headshotUrl && !photoFailed;

  return (
    <div ref={containerRef} className="relative mb-8">
      {/* Ambient team-color radial glow */}
      <div
        ref={glowRef}
        className="absolute inset-x-0 top-0 h-64 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 100% at 50% 0%, ${teamHex}, transparent)`,
          opacity: 0,
        }}
        aria-hidden="true"
      />

      <div className="relative z-10">
        <Link
          href="/drivers"
          className="inline-flex items-center gap-1.5 text-f1-muted text-sm hover:text-f1-text transition-colors duration-150 mb-6 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Drivers
        </Link>

        <div className="flex items-stretch border border-f1-grid bg-f1-dark-2/60 overflow-hidden rounded-sm">

          {/* ── Full-body portrait ─────────────────────── */}
          <div
            className="relative w-44 shrink-0 overflow-hidden"
            style={{ minHeight: 280, backgroundColor: `${teamHex}10` }}
          >
            {showPhoto ? (
              <img
                src={headshotUrl}
                alt={`${driver.forename} ${driver.surname}`}
                className="absolute inset-0 w-full h-full object-contain object-bottom"
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              /* Fallback: large initials centred vertically */
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="font-mono font-black text-5xl select-none"
                  style={{ color: teamHex, opacity: 0.4 }}
                >
                  {initials}
                </span>
              </div>
            )}

            {/* Bottom-to-card gradient to blend photo edge into card body */}
            <div
              className="absolute inset-x-0 bottom-0 h-16 pointer-events-none"
              style={{ background: "linear-gradient(to top, #1A1A1A, transparent)" }}
              aria-hidden="true"
            />
          </div>

          {/* ── Vertical team-color accent line ────────── */}
          <div
            className="w-0.5 shrink-0 self-stretch"
            style={{ backgroundColor: teamColor }}
          />

          {/* ── Driver info ─────────────────────────────── */}
          <div className="flex-1 min-w-0 p-5 flex flex-col justify-center">
            <div className="flex items-baseline gap-3 flex-wrap">
              <SplitReveal
                text={fullName}
                type="chars"
                stagger={0.03}
                delay={0.2}
                tag="h1"
                className="font-heading text-2xl font-black tracking-wide uppercase"
              />
              {driver.number && (
                <span className="font-mono text-2xl text-f1-muted/25 font-black tabular-nums">
                  {driver.number}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-2 text-sm text-f1-muted flex-wrap">
              {driver.current_constructor && (
                <>
                  <span className="font-medium" style={{ color: teamColor }}>
                    {driver.current_constructor.name}
                  </span>
                  <span className="text-f1-grid">|</span>
                </>
              )}
              {driver.nationality && <span>{driver.nationality}</span>}
              {driver.dob && (
                <>
                  <span className="text-f1-grid">|</span>
                  <span className="font-mono text-xs">
                    DOB: {driver.dob}
                  </span>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
