"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { positionColor } from "@/lib/format";
import { getTeamColor, getTeamHexColor } from "@/lib/constants/teams";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { useStandings } from "@/lib/hooks/use-standings";
import { ErrorState } from "@/components/error-state";
import { SeasonSelector } from "@/components/season-selector";
import type { DriverStanding, ConstructorStanding } from "@/lib/schemas/standings";

type Tab = "drivers" | "constructors";

export default function StandingsPage() {
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [activeTab, setActiveTab] = useState<Tab>("drivers");
  const { data, isLoading, error, refetch } = useStandings(season);

  const drivers = data?.driver_standings ?? [];
  const constructors = data?.constructor_standings ?? [];
  const maxPoints =
    activeTab === "drivers"
      ? (drivers[0]?.points ?? 0)
      : (constructors[0]?.points ?? 0);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            Championship Standings
          </h1>
          <SeasonSelector value={season} onChange={setSeason} />
        </div>
        <p className="text-f1-muted text-sm mt-1">
          {data ? `Round ${data.round}` : "Loading..."}
        </p>
      </div>

      {/* Tab switcher */}
      <div role="tablist" className="flex gap-0 mb-6 border-b border-f1-grid">
        {(["drivers", "constructors"] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize transition-colors duration-150",
              activeTab === tab
                ? "text-f1-text border-b-2 border-f1-red"
                : "text-f1-muted hover:text-f1-text"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton rows={activeTab === "drivers" ? 20 : 10} />
      ) : error ? (
        <ErrorState message="Failed to load standings data" onRetry={refetch} />
      ) : activeTab === "drivers" ? (
        <DriverTable drivers={drivers} maxPoints={maxPoints} />
      ) : (
        <ConstructorTable constructors={constructors} maxPoints={maxPoints} />
      )}
    </div>
  );
}

function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <div className="w-full space-y-0">
      {Array.from({ length: rows }, (_, i) => (
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
  );
}

function DriverTable({
  drivers,
  maxPoints,
}: {
  drivers: DriverStanding[];
  maxPoints: number;
}) {
  return (
    <div className="w-full">
      <div className="sticky top-0 z-10 grid grid-cols-[3rem_2fr_1fr_5rem_4rem_1fr] gap-x-4 px-4 py-2 text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark">
        <span>Pos</span>
        <span>Driver</span>
        <span>Team</span>
        <span className="text-right">Pts</span>
        <span className="text-right">Wins</span>
        <span />
      </div>

      {drivers.map((d, i) => {
        const teamColor = getTeamColor(d.constructor_name ?? "");
        const barWidth = maxPoints > 0 ? (d.points / maxPoints) * 100 : 0;

        return (
          <Link
            key={d.driver_ref}
            href={`/drivers/${d.driver_ref}`}
            className={cn(
              "grid grid-cols-[3rem_2fr_1fr_5rem_4rem_1fr] gap-x-4 items-center px-4 h-11 text-sm border-b border-f1-grid/50 transition-colors duration-100 hover:bg-f1-dark-3",
              i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3"
            )}
          >
            <span className={cn("font-mono text-base font-bold", positionColor(d.position))}>
              {d.position}
            </span>

            <div className="flex items-center gap-3">
              <div
                className="w-0.5 h-5 rounded-sm shrink-0"
                style={{ backgroundColor: teamColor }}
              />
              <span>
                <span className="text-f1-muted">{d.forename} </span>
                <span className="font-semibold uppercase">{d.surname}</span>
              </span>
            </div>

            <span className="text-f1-muted text-xs">{d.constructor_name}</span>

            <span className="text-right font-mono font-semibold">
              {Math.floor(d.points)}
            </span>

            <span className="text-right font-mono text-f1-muted">
              {d.wins > 0 ? d.wins : "\u2014"}
            </span>

            <div className="h-1.5 bg-f1-grid/30 rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-300"
                style={{ width: `${barWidth}%`, backgroundColor: teamColor }}
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ConstructorTable({
  constructors,
  maxPoints,
}: {
  constructors: ConstructorStanding[];
  maxPoints: number;
}) {
  return (
    <div className="w-full">
      <div className="sticky top-0 z-10 grid grid-cols-[3rem_2fr_5rem_4rem_1fr] gap-x-4 px-4 py-2 text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark">
        <span>Pos</span>
        <span>Constructor</span>
        <span className="text-right">Pts</span>
        <span className="text-right">Wins</span>
        <span />
      </div>

      {constructors.map((c, i) => {
        const teamColor = getTeamColor(c.constructor_ref);
        const hexColor = getTeamHexColor(c.constructor_ref);
        const barWidth = maxPoints > 0 ? (c.points / maxPoints) * 100 : 0;

        return (
          <div
            key={c.constructor_ref}
            className={cn(
              "grid grid-cols-[3rem_2fr_5rem_4rem_1fr] gap-x-4 items-center px-4 h-11 text-sm border-b border-f1-grid/50 transition-colors duration-100 hover:bg-f1-dark-3",
              i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3"
            )}
            style={{ backgroundColor: `${hexColor}08` }}
          >
            <span className={cn("font-mono text-base font-bold", positionColor(c.position))}>
              {c.position}
            </span>

            <div className="flex items-center gap-3">
              <div
                className="w-0.5 h-5 rounded-sm shrink-0"
                style={{ backgroundColor: teamColor }}
              />
              <span className="font-semibold">{c.name}</span>
            </div>

            <span className="text-right font-mono font-semibold">
              {Math.floor(c.points)}
            </span>

            <span className="text-right font-mono text-f1-muted">
              {c.wins > 0 ? c.wins : "\u2014"}
            </span>

            <div className="h-2 bg-f1-grid/30 rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-300"
                style={{ width: `${barWidth}%`, backgroundColor: teamColor }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
