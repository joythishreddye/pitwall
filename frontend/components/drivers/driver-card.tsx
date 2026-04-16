"use client";

import { useState } from "react";
import Link from "next/link";
import { getTeamColor, getTeamHexColor } from "@/lib/constants/teams";
import { findHeadshotUrl } from "@/lib/hooks/use-driver-photos";
import { cn } from "@/lib/utils";
import type { OpenF1Driver } from "@/lib/hooks/use-driver-photos";
import type { DriverStanding } from "@/lib/schemas/standings";

interface DriverCardProps {
  driver: DriverStanding;
  photoDrivers: OpenF1Driver[] | undefined;
}

/** 3-letter nationality abbreviation for HUD badge */
function natCode(nationality: string | null): string {
  if (!nationality) return "---";
  const abbrs: Record<string, string> = {
    British: "GBR", Dutch: "NED", Spanish: "ESP", Monégasque: "MON",
    Australian: "AUS", Mexican: "MEX", German: "GER", Finnish: "FIN",
    Icelandic: "ISL", French: "FRA", Chinese: "CHN", Italian: "ITA",
    Canadian: "CAN", Japanese: "JPN", Thai: "THA", Danish: "DEN",
    Brazilian: "BRA", American: "USA", "New Zealander": "NZL",
    Austrian: "AUT", Belgian: "BEL", Polish: "POL", Swedish: "SWE",
    Swiss: "SUI", Argentine: "ARG",
  };
  return abbrs[nationality] ?? nationality.slice(0, 3).toUpperCase();
}

/** P1 = gold, P2/P3 = silver/bronze, rest = muted */
function positionTextClass(pos: number): string {
  if (pos === 1) return "text-f1-gold";
  if (pos === 2) return "text-f1-silver";
  if (pos === 3) return "text-f1-bronze";
  return "text-f1-muted/40";
}

/**
 * Photo inside the hero strip.
 * Shows the driver headshot anchored to the bottom-right.
 * Falls back to large styled initials when no photo is available.
 */
function PhotoHero({
  src,
  forename,
  surname,
  teamHex,
}: {
  src: string | null;
  forename: string;
  surname: string;
  teamHex: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = `${forename?.[0] ?? "?"}${surname?.[0] ?? "?"}`;

  if (!src || failed) {
    return (
      <div
        className="absolute inset-0 flex items-end justify-end pr-4 pb-2 pointer-events-none"
        aria-hidden="true"
      >
        <span
          className="font-mono font-black text-5xl opacity-[0.12] select-none"
          style={{ color: teamHex }}
        >
          {initials}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${forename} ${surname}`}
      className="absolute bottom-0 right-0 h-full w-auto object-contain object-bottom pointer-events-none"
      style={{ maxWidth: "60%" }}
      onError={() => setFailed(true)}
      aria-hidden="true"
    />
  );
}

export function DriverCard({ driver, photoDrivers }: DriverCardProps) {
  const teamColor = getTeamColor(driver.constructor_name ?? "");
  const teamHex = getTeamHexColor(driver.constructor_name ?? "");
  const headshotUrl = findHeadshotUrl(photoDrivers, { surname: driver.surname });

  return (
    <Link
      href={`/drivers/${driver.driver_ref}`}
      className={cn(
        "driver-card group relative flex flex-col overflow-hidden",
        "border border-f1-grid bg-f1-dark-2 rounded-sm",
        "transition-colors duration-150 hover:border-f1-grid/80 cursor-pointer block"
      )}
      data-flip-id={driver.driver_ref}
      style={{ borderBottomColor: teamHex, borderBottomWidth: "2px" }}
    >
      {/* ── Hero photo strip ─────────────────────────── */}
      <div
        className="relative h-32 shrink-0 overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${teamHex}20 0%, #1A1A1A 55%)` }}
      >
        {/* Fade from left so position text stays readable */}
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{ background: "linear-gradient(to right, #1A1A1A 20%, transparent 65%)" }}
        />

        <PhotoHero
          src={headshotUrl}
          forename={driver.forename}
          surname={driver.surname}
          teamHex={teamHex}
        />

        {/* Position — absolute left */}
        <div className="absolute top-3 left-3 z-20">
          <span
            className={cn(
              "font-mono text-4xl font-black leading-none tabular-nums",
              positionTextClass(driver.position)
            )}
          >
            P{driver.position}
          </span>
        </div>

        {/* Nationality — absolute top-right */}
        <span className="absolute top-3 right-3 z-20 font-mono text-[10px] tracking-widest text-f1-muted/50 leading-none">
          {natCode(driver.nationality)}
        </span>

        {/* Team-color bottom edge on hero */}
        <div
          className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: `linear-gradient(to right, ${teamHex}60, transparent)` }}
        />
      </div>

      {/* ── Info section ─────────────────────────────── */}
      <div className="flex flex-col flex-1 px-3 pt-2 pb-3">
        {/* Driver name */}
        <p className="font-heading font-bold text-sm uppercase tracking-wide leading-snug mb-1">
          <span className="text-f1-muted font-normal text-xs">{driver.forename} </span>
          <span className="text-f1-text">{driver.surname}</span>
        </p>

        {/* Team */}
        <p className="text-[11px] truncate mb-3" style={{ color: teamColor }}>
          {driver.constructor_name ?? "—"}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 border-t border-f1-grid/50 pt-2 mt-auto">
          <div>
            <p className="text-[9px] text-f1-muted uppercase tracking-widest mb-0.5">PTS</p>
            <p className="font-mono text-sm font-semibold tabular-nums">
              {Math.floor(driver.points)}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-f1-muted uppercase tracking-widest mb-0.5">WINS</p>
            <p className="font-mono text-sm font-semibold tabular-nums">{driver.wins}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
