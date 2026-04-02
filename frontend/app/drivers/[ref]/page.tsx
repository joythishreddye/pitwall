"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { positionColor } from "@/lib/format";
import { getTeamColor, getTeamHexColor } from "@/lib/constants/teams";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { useDriverProfile, useDriverResults } from "@/lib/hooks/use-drivers";
import { useDriverPhotos, findHeadshotUrl } from "@/lib/hooks/use-driver-photos";
import { DriverPhoto } from "@/components/driver-photo";
import { SeasonSelector } from "@/components/season-selector";

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
        <div className="h-6 w-32 bg-f1-grid/30 rounded-sm animate-pulse mb-6" />
        <div className="h-10 w-64 bg-f1-grid/30 rounded-sm animate-pulse mb-2" />
        <div className="h-4 w-48 bg-f1-grid/30 rounded-sm animate-pulse" />
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
        <p className="text-f1-muted">Driver not found.</p>
      </div>
    );
  }

  const teamColor = driver.current_constructor
    ? getTeamColor(driver.current_constructor.ref)
    : "var(--color-f1-muted)";
  const teamHex = driver.current_constructor
    ? getTeamHexColor(driver.current_constructor.ref)
    : "#A3A3A3";
  const headshotUrl = findHeadshotUrl(photoDrivers, {
    number: driver.number,
    surname: driver.surname,
  });

  const stats = [
    { label: "Championships", value: driver.career_stats.championships },
    { label: "Wins", value: driver.career_stats.wins },
    { label: "Podiums", value: driver.career_stats.podiums },
    { label: "Poles", value: driver.career_stats.poles },
    { label: "Races", value: driver.career_stats.races },
    { label: "Career Points", value: Math.floor(driver.career_stats.points) },
  ];

  const results = resultsData?.results ?? [];

  return (
    <div className="p-8">
      <Link
        href="/drivers"
        className="inline-flex items-center gap-1.5 text-f1-muted text-sm hover:text-f1-text transition-colors duration-150 mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Drivers
      </Link>

      <div
        className="flex items-start gap-5 mb-8 p-5 rounded-sm"
        style={{ background: `linear-gradient(135deg, ${teamHex}15 0%, transparent 50%)` }}
      >
        <DriverPhoto
          src={headshotUrl}
          forename={driver.forename}
          surname={driver.surname}
          teamColor={teamColor}
          size={120}
        />
        <div
          className="w-1 h-12 rounded-sm shrink-0 mt-2"
          style={{ backgroundColor: teamColor }}
        />
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="text-f1-muted font-normal">{driver.forename}</span>{" "}
              <span className="uppercase">{driver.surname}</span>
            </h1>
            {driver.number && (
              <span className="font-mono text-2xl text-f1-muted/50 font-bold">
                {driver.number}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-f1-muted">
            {driver.current_constructor && (
              <>
                <span style={{ color: teamColor }}>{driver.current_constructor.name}</span>
                <span className="text-f1-grid">|</span>
              </>
            )}
            <span>{driver.nationality}</span>
            {driver.dob && (
              <>
                <span className="text-f1-grid">|</span>
                <span>DOB: {driver.dob}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {stats.map(({ label, value }) => (
          <div
            key={label}
            className="border border-f1-grid bg-f1-dark-2 p-3 rounded-sm"
          >
            <p className="text-xs text-f1-muted uppercase tracking-wider mb-1">{label}</p>
            <p className="font-mono text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold tracking-tight">
            {season} Results
          </h2>
          <SeasonSelector value={season} onChange={setSeason} />
        </div>

        {results.length > 0 ? (

          <div className="w-full">
            <div className="sticky top-0 z-10 grid grid-cols-[3rem_1fr_7rem_3.5rem_3rem_4rem] gap-x-4 px-4 py-2 text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark">
              <span>Rnd</span>
              <span>Race</span>
              <span>Date</span>
              <span className="text-right">Grid</span>
              <span className="text-right">Pos</span>
              <span className="text-right">Pts</span>
            </div>

            {results.map((r, i) => {
              const grid = r.grid ?? 0;
              const pos = r.position ?? 0;
              const gridDelta = pos > 0 && grid > 0 ? grid - pos : 0;
              const isDnf = r.position == null;

              return (
                <Link
                  key={r.race_id}
                  href={`/races/${r.race_id}`}
                  className={cn(
                    "grid grid-cols-[3rem_1fr_7rem_3.5rem_3rem_4rem] gap-x-4 items-center px-4 h-11 text-sm border-b border-f1-grid/50 transition-colors duration-100 hover:bg-f1-dark-3",
                    i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3"
                  )}
                >
                  <span className="font-mono text-f1-muted">{r.round}</span>
                  <span className="font-medium">{r.race_name}</span>
                  <span className="font-mono text-xs text-f1-muted">
                    {new Date(r.date + "T00:00:00").toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                  <span className="text-right font-mono text-f1-muted">
                    {r.grid ?? "\u2014"}
                  </span>
                  <div className="text-right flex items-center justify-end gap-1">
                    <span
                      className={cn(
                        "font-mono font-semibold",
                        isDnf ? "text-f1-red" : positionColor(r.position)
                      )}
                    >
                      {isDnf ? "DNF" : r.position}
                    </span>
                    {gridDelta !== 0 && !isDnf && (
                      <span
                        className={cn(
                          "text-[10px] font-mono",
                          gridDelta > 0 ? "text-f1-green" : "text-f1-red"
                        )}
                      >
                        {gridDelta > 0 ? `+${gridDelta}` : gridDelta}
                      </span>
                    )}
                  </div>
                  <span className="text-right font-mono font-semibold">
                    {(r.points ?? 0) > 0 ? Math.floor(r.points!) : "\u2014"}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-f1-muted text-sm py-8 text-center">
            No results for {season} season
          </p>
        )}
      </div>
    </div>
  );
}
