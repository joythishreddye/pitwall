"use client";

import { useState } from "react";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { useStandings } from "@/lib/hooks/use-standings";
import { useDriverPhotos } from "@/lib/hooks/use-driver-photos";
import { DriverGrid } from "@/components/drivers";
import { ErrorState } from "@/components/error-state";
import { SeasonSelector } from "@/components/season-selector";

export default function DriversPage() {
  const [season, setSeason] = useState(CURRENT_SEASON);
  const { data, isLoading, error, refetch } = useStandings(season, "driver");
  const { data: photoDrivers } = useDriverPhotos();
  const drivers = data?.driver_standings ?? [];

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight">Drivers</h1>
          <SeasonSelector value={season} onChange={setSeason} />
        </div>
        <p className="text-f1-muted text-xs font-mono uppercase tracking-widest">
          {drivers.length > 0 ? `${drivers.length} DRIVERS // ${season} CHAMPIONSHIP` : ""}
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl">
          {Array.from({ length: 9 }, (_, i) => (
            <div
              key={i}
              className="border border-f1-grid bg-f1-dark-2 rounded-sm h-36 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <ErrorState message="Failed to load drivers" onRetry={refetch} />
      ) : (
        <DriverGrid drivers={drivers} photoDrivers={photoDrivers} />
      )}
    </div>
  );
}
