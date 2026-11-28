"use client";

import { use, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { getTeamHexColor } from "@/lib/constants/teams";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { useDriverProfile, useDriverResults } from "@/lib/hooks/use-drivers";
import { useDriverPhotos, findHeadshotUrl } from "@/lib/hooks/use-driver-photos";
import { ProfileHeader } from "@/components/drivers/profile-header";
import { StatTileGrid } from "@/components/drivers/stat-tile-grid";
import { SeasonResultsTable } from "@/components/drivers/season-results-table";
import { SeasonSelector } from "@/components/season-selector";
import { ErrorState } from "@/components/error-state";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function DriverProfilePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = use(params);
  const [season, setSeason] = useState(CURRENT_SEASON);
  const { data: driver, isLoading, error, refetch } = useDriverProfile(ref);
  const {
    data: resultsData,
    isLoading: resultsLoading,
    refetch: refetchResults,
  } = useDriverResults(ref, season);
  const { data: photoDrivers } = useDriverPhotos();

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="h-5 w-28 bg-f1-grid/30 rounded-sm animate-pulse mb-6" />
        <div className="h-32 bg-f1-grid/20 rounded-sm animate-pulse mb-4" />
        <div className="grid grid-cols-4 gap-2 h-40 mb-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-f1-grid/20 rounded-sm animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // No driver to show. A 404 means the API has no such driver; anything else (a server error, a dropped
  // connection, the client's timeout, a request paused while offline) is a failed load the reader can retry.
  // Retry also reloads the season's results when there are none yet, since nothing else would. A background
  // refetch that fails keeps the driver already on screen.
  if (!driver) {
    const missing = error instanceof ApiError && error.status === 404;
    const retry = () => {
      void refetch();
      if (!resultsData) void refetchResults();
    };
    return (
      <div className="p-8">
        <Link
          href="/drivers"
          className="inline-flex items-center gap-1.5 text-f1-muted text-sm hover:text-f1-text transition-colors duration-150 mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Drivers
        </Link>
        {missing ? (
          <p className="text-f1-muted font-mono text-sm">DRIVER NOT FOUND</p>
        ) : (
          <ErrorState message="Couldn't load this driver." onRetry={retry} />
        )}
      </div>
    );
  }

  const teamHex = driver.current_constructor
    ? getTeamHexColor(driver.current_constructor.ref)
    : "var(--color-f1-muted)";
  const headshotUrl = findHeadshotUrl(photoDrivers, {
    acronym: driver.code,
    surname: driver.surname,
  });

  return (
    <div className="p-8">
      {/* Profile header: photo + SplitReveal name + team color glow */}
      <ProfileHeader
        driver={driver}
        teamHex={teamHex}
        headshotUrl={headshotUrl}
      />

      {/* Bento stat tiles with GSAP entrance timeline */}
      <StatTileGrid
        championships={driver.career_stats.championships}
        wins={driver.career_stats.wins}
        podiums={driver.career_stats.podiums}
        poles={driver.career_stats.poles}
        races={driver.career_stats.races}
        points={Math.floor(driver.career_stats.points)}
        teamHex={teamHex}
        careerSeasons={driver.career_seasons}
      />

      {/* Season results */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            {season} Results
          </h2>
          <SeasonSelector value={season} onChange={setSeason} />
        </div>
        {/* "No results" only when the season's results came back empty: while they load the space holds a
            placeholder, and a failed load (or one paused offline) says so and offers a retry */}
        {resultsData ? (
          <SeasonResultsTable results={resultsData.results} season={season} />
        ) : resultsLoading ? (
          <div className="h-40 bg-f1-grid/20 animate-pulse" />
        ) : (
          <ErrorState message="Couldn't load the results." onRetry={() => void refetchResults()} />
        )}
      </div>
    </div>
  );
}
