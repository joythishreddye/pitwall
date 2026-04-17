"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { useRaceCalendar } from "@/lib/hooks/use-races";
import { ErrorState } from "@/components/error-state";
import { SeasonSelector } from "@/components/season-selector";
import { RacesList } from "@/components/races";

export default function RacesPage() {
  const [season, setSeason] = useState(CURRENT_SEASON);
  const { data: races, isLoading, error, refetch } = useRaceCalendar(season);

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Race Calendar</h1>
          <SeasonSelector value={season} onChange={setSeason} />
        </div>
        <p className="text-f1-muted text-sm mt-1">
          {races ? `${races.length} rounds` : ""}
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 24 }, (_, i) => (
            <div
              key={i}
              className={cn(
                "min-h-48 border border-f1-grid bg-f1-dark-2 animate-pulse",
                i % 3 === 0 && "opacity-60"
              )}
            />
          ))}
        </div>
      ) : error ? (
        <ErrorState message="Failed to load race calendar" onRetry={refetch} />
      ) : races ? (
        <RacesList races={races} />
      ) : null}
    </div>
  );
}
