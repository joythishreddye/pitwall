"use client";

import Link from "next/link";
import { getTeamColor, getTeamHexColor } from "@/lib/constants/teams";
import { cn } from "@/lib/utils";
import type { DriverStanding } from "@/lib/schemas/standings";

interface DriverCardProps {
  driver: DriverStanding;
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

export function DriverCard({ driver }: DriverCardProps) {
  const teamColor = getTeamColor(driver.constructor_name ?? "");
  const teamHex = getTeamHexColor(driver.constructor_name ?? "");

  return (
    <Link
      href={`/drivers/${driver.driver_ref}`}
      className={cn(
        "driver-card group relative flex flex-col overflow-hidden",
        "border border-f1-grid bg-f1-dark-2 rounded-sm",
        "transition-colors duration-150 hover:bg-f1-dark-3 hover:border-f1-grid/80 cursor-pointer block"
      )}
      data-flip-id={driver.driver_ref}
      style={{ borderTopColor: teamHex, borderTopWidth: "2px" }}
    >
      {/* ── Main content ─────────────────────────────── */}
      <div className="relative flex flex-col flex-1 px-3 pt-3 pb-2 overflow-hidden">

        {/* Driver code — large faint watermark anchored top-right */}
        {driver.driver_code && (
          <span
            className="absolute top-2 right-3 font-mono font-black text-5xl leading-none select-none pointer-events-none tabular-nums"
            style={{ color: teamHex, opacity: 0.10 }}
            aria-hidden="true"
          >
            {driver.driver_code}
          </span>
        )}

        {/* Position badge */}
        <span
          className={cn(
            "font-mono text-3xl font-black leading-none tabular-nums mb-3",
            positionTextClass(driver.position)
          )}
        >
          P{driver.position}
        </span>

        {/* Driver name */}
        <p className="font-heading leading-snug mb-0.5">
          <span className="block text-[11px] text-f1-muted font-normal">{driver.forename}</span>
          <span className="block text-base font-bold uppercase tracking-wide text-f1-text">
            {driver.surname}
          </span>
        </p>

        {/* Team */}
        <p className="text-[11px] truncate mb-1" style={{ color: teamColor }}>
          {driver.constructor_name ?? "—"}
        </p>

        {/* Nationality */}
        <p className="font-mono text-[10px] uppercase tracking-widest text-f1-muted/60">
          {natCode(driver.nationality)}
        </p>
      </div>

      {/* ── Stats row ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 border-t border-f1-grid/50 px-3 py-2">
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
    </Link>
  );
}
