"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTeamColor } from "@/lib/constants/teams";
import { MOCK_RACES, MOCK_RACE_RESULTS, MOCK_PIT_STOPS } from "@/lib/mock/races";

type Tab = "results" | "pitstops";

export default function RaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState<Tab>("results");

  const race = MOCK_RACES.find((r) => r.id === Number(id));
  const results = MOCK_RACE_RESULTS;
  const pitStops = MOCK_PIT_STOPS;

  if (!race) {
    return (
      <div className="p-8">
        <p className="text-f1-muted">Race not found.</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Back link */}
      <Link
        href="/races"
        className="inline-flex items-center gap-1.5 text-f1-muted text-sm hover:text-f1-text transition-colors duration-150 mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Races
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {race.raceName}
        </h1>
        <div className="flex items-center gap-4 mt-1 text-sm text-f1-muted">
          <span>{race.circuitName}</span>
          <span className="text-f1-grid">|</span>
          <span className="font-mono">{race.date}</span>
          <span className="text-f1-grid">|</span>
          <span>Round {race.round}</span>
        </div>
      </div>

      {/* Tab switcher */}
      <div role="tablist" className="flex gap-0 mb-6 border-b border-f1-grid">
        {(["results", "pitstops"] as const).map((tab) => (
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
            {tab === "pitstops" ? "Pit Stops" : "Results"}
          </button>
        ))}
      </div>

      {activeTab === "results" ? (
        <ResultsTable results={results} />
      ) : (
        <PitStopsTable pitStops={pitStops} />
      )}
    </div>
  );
}

function ResultsTable({ results }: { results: typeof MOCK_RACE_RESULTS }) {
  return (
    <div className="w-full">
      <div className="sticky top-0 z-10 grid grid-cols-[3rem_2fr_1fr_3.5rem_4rem_5rem_4rem] gap-x-4 px-4 py-2 text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark">
        <span>Pos</span>
        <span>Driver</span>
        <span>Team</span>
        <span className="text-right">Grid</span>
        <span className="text-right">Pts</span>
        <span className="text-right">Gap</span>
        <span className="text-right">FL</span>
      </div>

      {results.map((r, i) => {
        const teamColor = getTeamColor(r.constructorRef);
        const gridDelta = r.grid - r.position;

        return (
          <div
            key={r.driverRef}
            className={cn(
              "grid grid-cols-[3rem_2fr_1fr_3.5rem_4rem_5rem_4rem] gap-x-4 items-center px-4 h-11 text-sm border-b border-f1-grid/50 transition-colors duration-100 hover:bg-f1-dark-3",
              i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3"
            )}
          >
            {/* Position */}
            <span
              className={cn(
                "font-mono text-base font-bold",
                r.position <= 3 ? "text-f1-text" : "text-f1-muted"
              )}
            >
              {r.status === "Retired" ? "DNF" : r.position}
            </span>

            {/* Driver */}
            <div className="flex items-center gap-3">
              <div
                className="w-0.5 h-5 rounded-sm shrink-0"
                style={{ backgroundColor: teamColor }}
              />
              <span>
                <span className="text-f1-muted">{r.givenName} </span>
                <span className="font-semibold uppercase">{r.familyName}</span>
              </span>
            </div>

            {/* Team */}
            <span className="text-f1-muted text-xs">{r.constructorName}</span>

            {/* Grid */}
            <div className="text-right flex items-center justify-end gap-1">
              <span className="font-mono text-f1-muted">{r.grid}</span>
              {gridDelta !== 0 && r.status !== "Retired" && (
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

            {/* Points */}
            <span className="text-right font-mono font-semibold">
              {r.points > 0 ? r.points : "\u2014"}
            </span>

            {/* Gap / Status */}
            <span className="text-right font-mono text-xs text-f1-muted">
              {r.position === 1 ? r.time : r.status}
            </span>

            {/* Fastest lap */}
            <span
              className={cn(
                "text-right font-mono text-xs",
                r.fastestLapRank === 1 ? "text-f1-green" : "text-f1-muted"
              )}
            >
              {r.fastestLapTime ?? "\u2014"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PitStopsTable({ pitStops }: { pitStops: typeof MOCK_PIT_STOPS }) {
  return (
    <div className="w-full">
      <div className="sticky top-0 z-10 grid grid-cols-[4rem_1fr_4rem_5rem] gap-x-4 px-4 py-2 text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark">
        <span>Lap</span>
        <span>Driver</span>
        <span className="text-right">Stop</span>
        <span className="text-right">Duration</span>
      </div>

      {pitStops.map((ps, i) => (
        <div
          key={`${ps.driverRef}-${ps.stop}`}
          className={cn(
            "grid grid-cols-[4rem_1fr_4rem_5rem] gap-x-4 items-center px-4 h-11 text-sm border-b border-f1-grid/50",
            i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3"
          )}
        >
          <span className="font-mono text-f1-muted">{ps.lap}</span>
          <span className="font-medium">{ps.driverName}</span>
          <span className="text-right font-mono text-f1-orange">{ps.stop}</span>
          <span className="text-right font-mono">{ps.duration}</span>
        </div>
      ))}
    </div>
  );
}
