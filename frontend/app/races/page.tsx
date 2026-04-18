"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { useRaceCalendar } from "@/lib/hooks/use-races";
import { ErrorState } from "@/components/error-state";
import { SeasonSelector } from "@/components/season-selector";
import { RacesList } from "@/components/races";

function RacesPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const season = Number(searchParams.get("season")) || CURRENT_SEASON;

  const setSeason = (year: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("season", String(year));
    router.push(`${pathname}?${params.toString()}`);
  };

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
                "min-h-52 border border-f1-grid bg-f1-dark-2 animate-pulse",
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

export default function RacesPage() {
  return (
    <Suspense>
      <RacesPageContent />
    </Suspense>
  );
}
