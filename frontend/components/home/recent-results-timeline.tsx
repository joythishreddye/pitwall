"use client";

import Link from "next/link";
import { Flag } from "lucide-react";
import { getTeamHexColor } from "@/lib/constants/teams";
import { useRaceDetail } from "@/lib/hooks/use-races";
import type { RaceCalendarItem } from "@/lib/schemas/races";
import { ScannerLine } from "@/components/ui/scanner-line";

interface RecentResultsTimelineProps {
  races: RaceCalendarItem[];
}

export function RecentResultsTimeline({ races }: RecentResultsTimelineProps) {
  const last3 = races.slice(-3).reverse();

  return (
    <div className="bg-f1-dark-2 border border-f1-grid">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-f1-grid">
        <Flag className="h-4 w-4 text-f1-red" />
        <span className="text-xs text-f1-muted uppercase tracking-widest">Recent Results</span>
      </div>

      {/* Horizontal scroll timeline */}
      <div className="flex overflow-x-auto scrollbar-thin divide-x divide-f1-grid">
        {last3.map((race, i) => (
          <RecentRaceCard key={race.id} race={race} rank={i} />
        ))}
      </div>
    </div>
  );
}

function RecentRaceCard({ race, rank }: { race: RaceCalendarItem; rank: number }) {
  const { data, isLoading } = useRaceDetail(race.id);
  const winner = data?.results[0];
  const teamHex = winner ? getTeamHexColor(winner.constructor.ref) : undefined;

  return (
    <Link
      href={`/races/${race.id}`}
      className="flex-1 min-w-[220px] p-4 hover:bg-f1-dark-3 transition-colors duration-100 cursor-pointer block"
    >
      {/* Round + date */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-data text-[10px] text-f1-muted uppercase tracking-widest">
          RD {race.round}
        </span>
        <span className="font-data text-[10px] text-f1-muted">{race.date}</span>
      </div>

      {/* Race name */}
      <p className="font-heading text-sm font-semibold text-f1-text mb-3 leading-tight">{race.name}</p>

      {/* Winner */}
      {isLoading ? (
        <ScannerLine />
      ) : winner ? (
        <div className="flex items-center gap-2">
          <div className="w-0.5 h-5 shrink-0" style={{ backgroundColor: teamHex }} />
          <span
            className="font-data text-xs font-bold mr-0.5"
            style={{ color: "var(--color-f1-gold)" }}
          >
            P1
          </span>
          <span className="text-f1-muted text-xs font-sans">{winner.driver.forename[0]}. </span>
          <span className="text-f1-text text-sm font-bold uppercase font-sans">{winner.driver.surname}</span>
        </div>
      ) : (
        <span className="text-f1-muted text-xs">No result</span>
      )}
    </Link>
  );
}
