"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { useRaceCalendar } from "@/lib/hooks/use-races";
import { ErrorState } from "@/components/error-state";
import { SeasonSelector } from "@/components/season-selector";

export default function RacesPage() {
  const [season, setSeason] = useState(CURRENT_SEASON);
  const { data: races, isLoading, error, refetch } = useRaceCalendar(season);
  const now = new Date();

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Race Calendar</h1>
          <SeasonSelector value={season} onChange={setSeason} />
        </div>
        <p className="text-f1-muted text-sm mt-1">
          {races ? `${races.length} races` : ""}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-0">
          {Array.from({ length: 24 }, (_, i) => (
            <div
              key={i}
              className={cn(
                "h-11 px-4 flex items-center border-b border-f1-grid/50",
                i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3"
              )}
            >
              <div className="h-3 w-full bg-f1-grid/30 rounded-sm animate-pulse" />
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState message="Failed to load race calendar" onRetry={refetch} />
      ) : (
        <div className="w-full">
          <div className="sticky top-0 z-10 grid grid-cols-[3rem_1fr_1fr_7rem] gap-x-4 px-4 py-2 text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark">
            <span>Rnd</span>
            <span>Grand Prix</span>
            <span>Circuit</span>
            <span>Date</span>
          </div>

          {races?.map((race, i) => {
            const raceDate = new Date(race.date + "T00:00:00");
            const isPast = raceDate < now;

            return (
              <Link
                key={race.id}
                href={`/races/${race.id}`}
                className={cn(
                  "grid grid-cols-[3rem_1fr_1fr_7rem] gap-x-4 items-center px-4 h-11 text-sm border-b border-f1-grid/50 transition-colors duration-100 hover:bg-f1-dark-3",
                  i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3"
                )}
              >
                <span className="font-mono text-f1-muted">{race.round}</span>

                <div>
                  <span className={cn("font-medium", isPast ? "text-f1-text" : "text-f1-muted")}>
                    {race.name}
                  </span>
                  <span className="text-f1-muted text-xs ml-2">{race.circuit.country}</span>
                </div>

                <span className="text-f1-muted text-xs">{race.circuit.name}</span>

                <span className="font-mono text-xs text-f1-muted">
                  {raceDate.toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
