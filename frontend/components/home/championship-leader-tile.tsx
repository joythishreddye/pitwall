"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { NumberCounter } from "@/components/ui/number-counter";
import { getTeamColor, getTeamHexColor } from "@/lib/constants/teams";
import { useDriverPhotos, findHeadshotUrl } from "@/lib/hooks/use-driver-photos";
import type { DriverStanding } from "@/lib/schemas/standings";

interface ChampionshipLeaderTileProps {
  leader: DriverStanding;
}

export function ChampionshipLeaderTile({ leader }: ChampionshipLeaderTileProps) {
  const { data: driverPhotos } = useDriverPhotos();
  const teamColor = getTeamColor(leader.constructor_name ?? "");
  const teamHex = getTeamHexColor(leader.constructor_name ?? "");

  const photoUrl = findHeadshotUrl(driverPhotos, {
    surname: leader.surname,
  });

  return (
    <div className="relative overflow-hidden bg-f1-dark-2 border border-f1-grid group cursor-pointer h-full">
      <Link href="/standings" className="absolute inset-0 z-10" aria-label={`Championship leader: ${leader.forename} ${leader.surname}`} />

      {/* Team color top bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: teamHex }} />

      {/* Photo background — fills right side */}
      {photoUrl && (
        <div className="absolute right-0 top-0 bottom-0 w-2/3 overflow-hidden pointer-events-none">
          {/* Grayscale driver image */}
          <img
            src={photoUrl}
            alt={`${leader.forename} ${leader.surname}`}
            className="absolute right-0 top-0 h-full w-full object-cover object-top"
            style={{ filter: "grayscale(100%) contrast(1.1) brightness(0.85)" }}
          />
          {/* Team color duotone overlay */}
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: teamHex,
              mixBlendMode: "multiply",
              opacity: 0.25,
            }}
          />
          {/* Scan-line texture */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.12) 1px, rgba(0,0,0,0.12) 2px)",
              backgroundSize: "100% 2px",
            }}
          />
          {/* Left gradient fade */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to right, #1A1A1A 0%, #1A1A1A 15%, transparent 55%)",
            }}
          />
        </div>
      )}

      {/* Content */}
      <div className="relative z-[5] p-5 h-full flex flex-col justify-between min-h-[160px]">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-f1-gold" />
          <span className="text-xs text-f1-muted uppercase tracking-widest">Championship Leader</span>
        </div>

        {/* Driver info */}
        <div>
          {/* P1 badge */}
          <div className="flex items-baseline gap-3 mb-1">
            <span
              className="font-data text-xs font-bold px-1.5 py-0.5"
              style={{
                backgroundColor: teamHex,
                color: "#0F0F0F",
              }}
            >
              P1
            </span>
            <span className="text-f1-muted text-sm font-sans">{leader.constructor_name}</span>
          </div>

          {/* Name */}
          <div className="mb-3">
            <span className="text-f1-muted font-heading text-xl font-medium">{leader.forename} </span>
            <span className="text-f1-text font-heading text-xl font-bold uppercase tracking-tight">{leader.surname}</span>
          </div>

          {/* Points + wins */}
          <div className="flex items-baseline gap-4">
            <div>
              <span className="font-data text-5xl font-bold" style={{ color: teamHex }}>
                <NumberCounter value={leader.points} duration={1} />
              </span>
              <span className="text-f1-muted text-xs font-data ml-1.5">PTS</span>
            </div>
            <div className="border-l border-f1-grid pl-4">
              <span className="font-data text-2xl font-bold text-f1-text">
                <NumberCounter value={leader.wins} duration={0.8} />
              </span>
              <span className="text-f1-muted text-xs font-data ml-1">WIN{leader.wins !== 1 ? "S" : ""}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hover inner glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-100 pointer-events-none"
        style={{ boxShadow: `inset 0 0 40px ${teamHex}10` }}
      />
    </div>
  );
}
