"use client";

import { useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { NumberCounter } from "@/components/ui/number-counter";
import { getTeamHexColor } from "@/lib/constants/teams";
import { useDriverPhotos, findHeadshotUrl } from "@/lib/hooks/use-driver-photos";
import type { DriverStanding } from "@/lib/schemas/standings";

interface ChampionshipLeaderTileProps {
  leader: DriverStanding;
  /** Set to true once the scanner has passed this tile to fire internal animations */
  revealed?: boolean;
}

export function ChampionshipLeaderTile({ leader, revealed = false }: ChampionshipLeaderTileProps) {
  const { data: driverPhotos, isPending: photosPending } = useDriverPhotos();
  const teamHex = getTeamHexColor(leader.constructor_name ?? "");

  const photoUrl = findHeadshotUrl(driverPhotos, {
    acronym: leader.driver_code,
    surname: leader.surname,
  });
  // Remember which URL failed, so a new leader's photo gets its own chance
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // No photo (OpenF1 refuses free clients during live sessions): the tile
  // shows text only. The old faded driver-code watermark failed contrast.
  const showPhoto = Boolean(photoUrl) && photoUrl !== failedUrl;

  return (
    <div className="relative overflow-hidden bg-f1-dark-2 border border-f1-grid group cursor-pointer h-full">
      <Link href="/standings" className="absolute inset-0 z-10" aria-label={`Championship leader: ${leader.forename} ${leader.surname}`} />

      {/* Team color top bar — z-[6] to sit above the photo layer */}
      <div className="absolute top-0 left-0 right-0 h-0.5 z-[6]" style={{ backgroundColor: teamHex }} />

      {/* No photo: a team-colour wash fills the tile (DESIGN.md: team colour beyond thin bars). It waits for
          the lookup to settle, or it flashes before the photo arrives. */}
      {!showPhoto && !photosPending && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `linear-gradient(135deg, transparent 35%, ${teamHex}26)` }}
        />
      )}

      {/* Driver photo — bottom-anchored portrait, natural proportions */}
      {showPhoto && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Headshot anchored top-right — face visible from the top */}
          <img
            src={photoUrl ?? undefined}
            alt={`${leader.forename} ${leader.surname} — ${leader.constructor_name ?? 'F1'}`}
            className="absolute top-0 right-0 h-full w-auto"
            style={{ opacity: 0.75 }}
            onError={() => setFailedUrl(photoUrl ?? null)}
          />
          {/* Left gradient — blends into card text area */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to right, var(--color-f1-dark-2) 0%, var(--color-f1-dark-2) 30%, color-mix(in srgb, var(--color-f1-dark-2) 60%, transparent) 50%, transparent 65%)",
            }}
          />
          {/* Bottom gradient — grounds the image into the card */}
          <div
            className="absolute inset-x-0 bottom-0 h-1/4"
            style={{ background: "linear-gradient(to top, var(--color-f1-dark-2), transparent)" }}
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
                color: "var(--color-f1-dark)",
              }}
            >
              P1
            </span>
            <span className="text-f1-muted text-sm font-sans">{leader.constructor_name}</span>
          </div>

          {/* Name: shown at once, since text must be settled when it appears */}
          <div className="mb-3">
            <span className="text-f1-muted font-heading text-xl font-medium">{leader.forename} </span>
            <span className="text-f1-text font-heading text-xl font-bold uppercase tracking-tight">
              {leader.surname.toUpperCase()}
            </span>
          </div>

          {/* Points + wins */}
          <div className="flex items-baseline gap-4">
            <div>
              <span className="font-data text-5xl font-bold" style={{ color: teamHex }}>
                <NumberCounter value={leader.points} duration={1} paused={!revealed} />
              </span>
              <span className="text-f1-muted text-xs font-data ml-1.5">PTS</span>
            </div>
            <div className="border-l border-f1-grid pl-4">
              <span className="font-data text-2xl font-bold text-f1-text">
                <NumberCounter value={leader.wins} duration={0.8} paused={!revealed} />
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
