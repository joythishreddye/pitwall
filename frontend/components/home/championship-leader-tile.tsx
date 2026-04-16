"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { NumberCounter } from "@/components/ui/number-counter";
import { SplitReveal } from "@/components/ui/split-reveal";
import { getTeamHexColor } from "@/lib/constants/teams";
import { useDriverPhotos, findHeadshotUrl } from "@/lib/hooks/use-driver-photos";
import type { DriverStanding } from "@/lib/schemas/standings";

interface ChampionshipLeaderTileProps {
  leader: DriverStanding;
}

export function ChampionshipLeaderTile({ leader }: ChampionshipLeaderTileProps) {
  const { data: driverPhotos } = useDriverPhotos();
  const teamHex = getTeamHexColor(leader.constructor_name ?? "");

  const photoUrl = findHeadshotUrl(driverPhotos, {
    surname: leader.surname,
  });

  return (
    <div className="relative overflow-hidden bg-f1-dark-2 border border-f1-grid group cursor-pointer h-full">
      <Link href="/standings" className="absolute inset-0 z-10" aria-label={`Championship leader: ${leader.forename} ${leader.surname}`} />

      {/* Team color top bar — z-[6] to sit above the photo layer */}
      <div className="absolute top-0 left-0 right-0 h-0.5 z-[6]" style={{ backgroundColor: teamHex }} />

      {/* Driver photo — bottom-anchored portrait, natural proportions */}
      {photoUrl && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Image sits at bottom-right, full natural height, no stretching */}
          <img
            src={photoUrl}
            alt={`${leader.forename} ${leader.surname}`}
            className="absolute bottom-0 right-0 max-h-[90%] w-auto h-auto"
            style={{ opacity: 0.65 }}
          />
          {/* Left gradient — blends into card text area */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to right, #1A1A1A 0%, #1A1A1A 20%, rgba(26,26,26,0.75) 50%, transparent 75%)",
            }}
          />
          {/* Bottom gradient — grounds the image into the card */}
          <div
            className="absolute inset-x-0 bottom-0 h-1/4"
            style={{ background: "linear-gradient(to top, #1A1A1A, transparent)" }}
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

          {/* Name — forename static, surname SplitReveal char-by-char */}
          <div className="mb-3">
            <span className="text-f1-muted font-heading text-xl font-medium">{leader.forename} </span>
            <SplitReveal
              text={leader.surname.toUpperCase()}
              type="chars"
              stagger={0.08}
              duration={0.4}
              delay={0.5}
              tag="span"
              className="text-f1-text font-heading text-xl font-bold uppercase tracking-tight"
            />
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
