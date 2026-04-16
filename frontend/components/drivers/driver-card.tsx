"use client";

import Link from "next/link";
import { DriverPhoto } from "@/components/driver-photo";
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
    British: "GBR",
    Dutch: "NED",
    Spanish: "ESP",
    Monégasque: "MON",
    Australian: "AUS",
    Mexican: "MEX",
    German: "GER",
    Finnish: "FIN",
    Icelandic: "ISL",
    French: "FRA",
    Chinese: "CHN",
    Italian: "ITA",
    Canadian: "CAN",
    Japanese: "JPN",
    Thai: "THA",
    Danish: "DEN",
    Brazilian: "BRA",
    American: "USA",
    "New Zealander": "NZL",
    Austrian: "AUT",
    Belgian: "BEL",
    Polish: "POL",
    Swedish: "SWE",
    Swiss: "SUI",
    Argentine: "ARG",
  };
  return abbrs[nationality] ?? nationality.slice(0, 3).toUpperCase();
}

export function DriverCard({ driver, photoDrivers }: DriverCardProps) {
  const teamColor = getTeamColor(driver.constructor_name ?? "");
  const teamHex = getTeamHexColor(driver.constructor_name ?? "");
  const headshotUrl = findHeadshotUrl(photoDrivers, { surname: driver.surname });

  return (
    <Link
      href={`/drivers/${driver.driver_ref}`}
      className={cn(
        "driver-card relative flex flex-col overflow-hidden",
        "border border-f1-grid bg-f1-dark-2 p-4 rounded-sm",
        "transition-colors duration-150 hover:bg-f1-dark-3 cursor-pointer block"
      )}
      data-flip-id={driver.driver_ref}
      style={{ borderBottomColor: teamHex, borderBottomWidth: "2px" }}
    >
        {/* Nationality badge — top-left */}
        <span className="absolute top-2 left-2 font-mono text-[9px] tracking-widest text-f1-muted/60 leading-none">
          {natCode(driver.nationality)}
        </span>

        {/* Photo + position row */}
        <div className="flex items-center justify-between mt-4 mb-3">
          <span
            className={cn(
              "font-mono text-2xl font-black leading-none tabular-nums",
              driver.position === 1
                ? "text-f1-gold"
                : driver.position <= 3
                  ? "text-f1-silver"
                  : "text-f1-muted/30"
            )}
          >
            P{driver.position}
          </span>
          <DriverPhoto
            src={headshotUrl}
            forename={driver.forename}
            surname={driver.surname}
            teamColor={teamHex}
            size={56}
          />
        </div>

        {/* Name */}
        <p className="font-heading font-bold text-sm uppercase tracking-wide leading-tight mb-0.5">
          <span className="text-f1-muted font-normal">{driver.forename} </span>
          <span className="text-f1-text">{driver.surname}</span>
        </p>

        {/* Team */}
        <p className="text-[11px] mb-3 truncate" style={{ color: teamColor }}>
          {driver.constructor_name ?? "—"}
        </p>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2 border-t border-f1-grid/50 pt-2 mt-auto">
          <div>
            <p className="text-[9px] text-f1-muted uppercase tracking-widest mb-0.5">
              PTS
            </p>
            <p className="font-mono text-sm font-semibold tabular-nums">
              {Math.floor(driver.points)}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-f1-muted uppercase tracking-widest mb-0.5">
              WINS
            </p>
            <p className="font-mono text-sm font-semibold tabular-nums">
              {driver.wins}
            </p>
          </div>
        </div>
    </Link>
  );
}
