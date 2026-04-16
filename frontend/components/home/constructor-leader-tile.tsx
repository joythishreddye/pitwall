"use client";

import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { NumberCounter } from "@/components/ui/number-counter";
import { getTeamColor, getTeamHexColor } from "@/lib/constants/teams";
import type { ConstructorStanding } from "@/lib/schemas/standings";

interface ConstructorLeaderTileProps {
  leader: ConstructorStanding;
  revealed?: boolean;
}

export function ConstructorLeaderTile({ leader, revealed = false }: ConstructorLeaderTileProps) {
  const teamColor = getTeamColor(leader.constructor_ref);
  const teamHex = getTeamHexColor(leader.constructor_ref);

  return (
    <div className="relative overflow-hidden bg-f1-dark-2 border border-f1-grid group cursor-pointer h-full">
      <Link href="/standings" className="absolute inset-0 z-10" aria-label={`Constructor leader: ${leader.name}`} />

      {/* Team color gradient right edge */}
      <div
        className="absolute right-0 top-0 bottom-0 w-16 pointer-events-none"
        style={{
          background: `linear-gradient(to left, ${teamHex}20, transparent)`,
        }}
      />
      <div className="absolute right-0 top-0 bottom-0 w-0.5 pointer-events-none" style={{ backgroundColor: teamHex }} />

      {/* Content */}
      <div className="relative z-[5] p-5 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-f1-cyan" />
          <span className="text-xs text-f1-muted uppercase tracking-widest">Constructor Leader</span>
        </div>

        {/* Team name + nationality */}
        <div className="flex items-center gap-2.5">
          <div className="w-0.5 h-8 shrink-0" style={{ backgroundColor: teamHex }} />
          <div>
            <p className="font-heading text-lg font-semibold text-f1-text leading-tight">{leader.name}</p>
            <p className="text-xs text-f1-muted">{leader.nationality}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-baseline gap-4">
          <div>
            <span className="font-data text-3xl font-bold" style={{ color: teamHex }}>
              <NumberCounter value={leader.points} duration={1} paused={!revealed} />
            </span>
            <span className="text-f1-muted text-xs font-data ml-1.5">PTS</span>
          </div>
          <div className="border-l border-f1-grid pl-4">
            <span className="font-data text-xl font-bold text-f1-text">
              <NumberCounter value={leader.wins} duration={0.8} paused={!revealed} />
            </span>
            <span className="text-f1-muted text-xs font-data ml-1">WIN{leader.wins !== 1 ? "S" : ""}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
