"use client";

import { use, useState } from "react";
import { getTeamColor, getTeamHexColor } from "@/lib/constants/teams";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { useDriverProfile, useDriverResults } from "@/lib/hooks/use-drivers";
import { useDriverPhotos, findHeadshotUrl } from "@/lib/hooks/use-driver-photos";
import { ProfileHeader } from "@/components/drivers/profile-header";
import { StatTileGrid } from "@/components/drivers/stat-tile-grid";
import { SeasonResultsTable } from "@/components/drivers/season-results-table";
import { SeasonSelector } from "@/components/season-selector";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function DriverProfilePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = use(params);
  const [season, setSeason] = useState(CURRENT_SEASON);
  const { data: driver, isLoading, error } = useDriverProfile(ref);
  const { data: resultsData } = useDriverResults(ref, season);
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

  if (error || !driver) {
    return (
      <div className="p-8">
        <Link
          href="/drivers"
          className="inline-flex items-center gap-1.5 text-f1-muted text-sm hover:text-f1-text transition-colors duration-150 mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Drivers
        </Link>
        <p className="text-f1-muted font-mono text-sm">DRIVER NOT FOUND</p>
      </div>
    );
  }

  const teamColor = driver.current_constructor
    ? getTeamColor(driver.current_constructor.ref)
    : "var(--color-f1-muted)";
  const teamHex = driver.current_constructor
    ? getTeamHexColor(driver.current_constructor.ref)
    : "var(--color-f1-muted)";
  const headshotUrl = findHeadshotUrl(photoDrivers, {
    acronym: driver.code,
    surname: driver.surname,
  });
  const results = resultsData?.results ?? [];

  return (
    <div className="p-8">
      {/* Profile header: photo + SplitReveal name + team color glow */}
      <ProfileHeader
        driver={driver}
        teamColor={teamColor}
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
        <SeasonResultsTable results={results} season={season} />
      </div>
    </div>
  );
}
