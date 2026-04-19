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
  const photoRef = useRef<HTMLDivElement>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  useGSAP(
    () => {
      if (respectsReducedMotion()) {
        if (glowRef.current) gsap.set(glowRef.current, { opacity: 0.18 });
        return;
      }
      const tl = gsap.timeline();
      if (glowRef.current) {
        tl.fromTo(
          glowRef.current,
          { opacity: 0 },
          { opacity: 0.18, duration: 0.9, ease: "pitwall-accel" }
        );
      }
      if (photoRef.current) {
        tl.fromTo(
          photoRef.current,
          { opacity: 0, scale: 0.96 },
          { opacity: 1, scale: 1, duration: 0.45, ease: "pitwall-accel" },
          "-=0.6"
        );
      }
    },
    { scope: containerRef, dependencies: [teamHex] }
  );

  const showPhoto = headshotUrl && !photoFailed;
  const initials = `${driver.forename[0] ?? "?"}${driver.surname[0] ?? "?"}`;

  return (
    <div ref={containerRef} className="relative mb-8 bg-f1-dark-2 border border-f1-grid overflow-hidden">
      {/* 2px team-color top bar */}
      <div className="h-0.5 w-full" style={{ backgroundColor: teamHex }} />

      {/* Ambient glow — radiates from top-right corner where the headshot sits */}
      <div
        ref={glowRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 60% 85% at 100% 0%, ${teamHex}, transparent)`,
          opacity: 0,
        }}
        aria-hidden="true"
      />

      {/* Driver number — huge faint watermark anchored bottom-left */}
      {driver.number && (
        <span
          className="absolute left-4 bottom-0 font-mono font-black leading-[0.85] select-none pointer-events-none tabular-nums"
          style={{
            fontSize: "clamp(96px, 16vw, 192px)",
            color: teamHex,
            opacity: 0.05,
          }}
          aria-hidden="true"
        >
          {driver.number}
        </span>
      )}

      {/* Content */}
      <div className="relative z-10 p-6 flex items-start gap-4 justify-between">

        {/* ── Left: back link + name + metadata ──────────────── */}
        <div className="flex flex-col min-w-0 flex-1">
          <Link
            href="/drivers"
            className="inline-flex items-center gap-1.5 text-f1-muted text-sm hover:text-f1-text transition-colors duration-150 mb-5 cursor-pointer w-fit"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Drivers
          </Link>

          {/* Name */}
          <div className="mb-5">
            <span className="block text-sm text-f1-muted font-normal mb-1 tracking-wide">
              {driver.forename}
            </span>
            <SplitReveal
              text={driver.surname.toUpperCase()}
              type="chars"
              stagger={0.03}
              delay={0.1}
              tag="h1"
              className="font-heading font-black tracking-tight uppercase text-3xl sm:text-5xl lg:text-6xl leading-none"
            />
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-2 flex-wrap">
            {driver.current_constructor && (
              <span
                className="text-xs font-medium px-2 py-0.5 border"
                style={{ color: teamHex, borderColor: `${teamHex}50` }}
              >
                {driver.current_constructor.name}
              </span>
            )}

            {driver.nationality && (
              <span className="text-f1-muted text-xs">{driver.nationality}</span>
            )}

            {driver.dob && (
              <>
                <span className="text-f1-grid text-xs">·</span>
                <span className="font-mono text-[11px] text-f1-muted/70">
                  b. {driver.dob}
                </span>
              </>
            )}

            {driver.code && (
              <>
                <span className="text-f1-grid text-xs">·</span>
                <span
                  className="font-mono text-xs font-bold tracking-widest"
                  style={{ color: teamHex }}
                >
                  {driver.code}
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── Right: headshot ─────────────────────────────────── */}
        <div
          ref={photoRef}
          className="relative flex-shrink-0 w-28 h-28 sm:w-44 sm:h-44 overflow-hidden border"
          style={{
            borderColor: `${teamHex}55`,
            backgroundColor: `${teamHex}0d`,
          }}
        >
          {showPhoto ? (
            <img
              src={headshotUrl}
              alt={`${driver.forename} ${driver.surname}${driver.current_constructor ? ` — ${driver.current_constructor.name}` : ''}`}
              className="w-full h-full object-cover object-top"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="font-mono font-black text-3xl select-none"
                style={{ color: teamHex, opacity: 0.4 }}
              >
                {initials}
              </span>
            </div>
          )}

          {/* Subtle bottom fade to blend headshot into card background */}
          <div
            className="absolute inset-x-0 bottom-0 h-8 pointer-events-none"
            style={{ background: "linear-gradient(to top, #1A1A1A, transparent)" }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
