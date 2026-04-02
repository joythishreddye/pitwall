"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTeamColor } from "@/lib/constants/teams";
import { useRaceDetail, useRaceStrategy } from "@/lib/hooks/use-races";
import { formatLapTime, formatGap, formatPitDuration, positionColor } from "@/lib/format";
import { getCircuitMeta } from "@/lib/constants/circuits";
import type { RaceResult, DriverStrategy } from "@/lib/schemas/races";

type Tab = "results" | "pitstops";

export default function RaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const raceId = Number(id);
  const [activeTab, setActiveTab] = useState<Tab>("results");

  const { data: race, isLoading, error } = useRaceDetail(raceId);
  const { data: strategy } = useRaceStrategy(raceId);

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="h-6 w-48 bg-f1-grid/30 rounded-sm animate-pulse mb-4" />
        <div className="h-8 w-80 bg-f1-grid/30 rounded-sm animate-pulse mb-2" />
        <div className="h-4 w-60 bg-f1-grid/30 rounded-sm animate-pulse" />
      </div>
    );
  }

  if (error || !race) {
    return (
      <div className="p-8">
        <Link
          href="/races"
          className="inline-flex items-center gap-1.5 text-f1-muted text-sm hover:text-f1-text transition-colors duration-150 mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Races
        </Link>
        <p className="text-f1-muted">Race not found.</p>
      </div>
    );
  }

  const winnerMs = race.results[0]?.time_millis ?? null;
  const circuitMeta = getCircuitMeta(race.circuit.name);

  return (
    <div className="p-8">
      <Link
        href="/races"
        className="inline-flex items-center gap-1.5 text-f1-muted text-sm hover:text-f1-text transition-colors duration-150 mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Races
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{race.name}</h1>
        <div className="flex items-center gap-4 mt-1 text-sm text-f1-muted">
          <span>{race.circuit.name}</span>
          <span className="text-f1-grid">|</span>
          <span className="font-mono">{race.date}</span>
          <span className="text-f1-grid">|</span>
          <span>Round {race.round}</span>
        </div>
      </div>

      {circuitMeta && (
        <div className="flex items-center gap-6 mb-6 px-4 py-3 border border-f1-grid bg-f1-dark-2 rounded-sm text-sm">
          <img
            src={`/circuits/${circuitMeta.key}.svg`}
            alt={`${race.circuit.name} layout`}
            className="h-16 w-auto opacity-60 shrink-0"
          />
          <div>
            <span className="text-[10px] text-f1-muted uppercase tracking-wider">Length</span>
            <p className="font-mono font-semibold">{circuitMeta.lengthKm} km</p>
          </div>
          <div>
            <span className="text-[10px] text-f1-muted uppercase tracking-wider">Turns</span>
            <p className="font-mono font-semibold">{circuitMeta.turns}</p>
          </div>
          <div>
            <span className="text-[10px] text-f1-muted uppercase tracking-wider">DRS Zones</span>
            <p className="font-mono font-semibold">{circuitMeta.drsZones}</p>
          </div>
          {circuitMeta.lapRecord && (
            <div>
              <span className="text-[10px] text-f1-muted uppercase tracking-wider">Lap Record</span>
              <p className="font-mono font-semibold">
                {circuitMeta.lapRecord.time}
                <span className="text-f1-muted font-normal ml-1.5">
                  {circuitMeta.lapRecord.driver} ({circuitMeta.lapRecord.year})
                </span>
              </p>
            </div>
          )}
        </div>
      )}

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
        <ResultsTable results={race.results} winnerMs={winnerMs} />
      ) : (
        <PitStopsTable strategy={strategy ?? []} />
      )}
    </div>
  );
}

function ResultsTable({
  results,
  winnerMs,
}: {
  results: RaceResult[];
  winnerMs: number | null;
}) {
  return (
    <div className="w-full">
      <div className="sticky top-0 z-10 grid grid-cols-[3rem_2fr_1fr_3.5rem_4rem_6rem_5rem] gap-x-4 px-4 py-2 text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark">
        <span>Pos</span>
        <span>Driver</span>
        <span>Team</span>
        <span className="text-right">Grid</span>
        <span className="text-right">Pts</span>
        <span className="text-right">Gap</span>
        <span className="text-right">FL</span>
      </div>

      {results.map((r, i) => {
        const teamColor = getTeamColor(r.constructor.ref);
        const grid = r.grid ?? 0;
        const pos = r.position ?? 0;
        const gridDelta = pos > 0 ? grid - pos : 0;
        const isDnf = r.position == null || r.status === "Retired" || (r.status && r.status !== "Finished" && !r.status.startsWith("+"));

        return (
          <Link
            key={r.driver.ref}
            href={`/drivers/${r.driver.ref}`}
            className={cn(
              "grid grid-cols-[3rem_2fr_1fr_3.5rem_4rem_6rem_5rem] gap-x-4 items-center px-4 h-11 text-sm border-b border-f1-grid/50 transition-colors duration-100 hover:bg-f1-dark-3",
              i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3"
            )}
          >
            <span className={cn(
              "font-mono text-base font-bold",
              isDnf ? "text-f1-red" : positionColor(r.position)
            )}>
              {isDnf ? "DNF" : r.position}
            </span>

            <div className="flex items-center gap-3">
              <div
                className="w-0.5 h-5 rounded-sm shrink-0"
                style={{ backgroundColor: teamColor }}
              />
              <span>
                <span className="text-f1-muted">{r.driver.forename} </span>
                <span className="font-semibold uppercase">{r.driver.surname}</span>
              </span>
            </div>

            <span className="text-f1-muted text-xs">{r.constructor.name}</span>

            <div className="text-right flex items-center justify-end gap-1">
              <span className="font-mono text-f1-muted">{r.grid ?? "\u2014"}</span>
              {gridDelta !== 0 && !isDnf && (
                <span className={cn(
                  "text-[10px] font-mono",
                  gridDelta > 0 ? "text-f1-green" : "text-f1-red"
                )}>
                  {gridDelta > 0 ? `+${gridDelta}` : gridDelta}
                </span>
              )}
            </div>

            <span className="text-right font-mono font-semibold">
              {(r.points ?? 0) > 0 ? Math.floor(r.points!) : "\u2014"}
            </span>

            <span className="text-right font-mono text-xs text-f1-muted">
              {r.position === 1
                ? formatLapTime(r.time_millis)
                : formatGap(r.time_millis, winnerMs, r.status)}
            </span>

            <span className={cn(
              "text-right font-mono text-xs",
              r.fastest_lap_rank === 1 ? "text-f1-green" : "text-f1-muted"
            )}>
              {r.fastest_lap_rank === 1 ? "FL" : "\u2014"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function PitStopsTable({ strategy }: { strategy: DriverStrategy[] }) {
  if (strategy.length === 0) {
    return (
      <p className="text-f1-muted text-sm">
        Pit stop data not available for this race — FastF1 data covers 2022+ sessions
      </p>
    );
  }

  const allStops = strategy.flatMap((s) =>
    s.pit_stops.map((ps) => ({
      ...ps,
      driver: s.driver,
    }))
  ).sort((a, b) => a.lap - b.lap);

  return (
    <div className="w-full">
      <div className="sticky top-0 z-10 grid grid-cols-[4rem_1fr_4rem_5rem] gap-x-4 px-4 py-2 text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark">
        <span>Lap</span>
        <span>Driver</span>
        <span className="text-right">Stop</span>
        <span className="text-right">Duration</span>
      </div>

      {allStops.map((ps, i) => {
        const teamColor = getTeamColor(ps.driver.ref);
        return (
          <div
            key={`${ps.driver.ref}-${ps.stop_number}`}
            className={cn(
              "grid grid-cols-[4rem_1fr_4rem_5rem] gap-x-4 items-center px-4 h-11 text-sm border-b border-f1-grid/50",
              i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3"
            )}
          >
            <span className="font-mono text-f1-muted">{ps.lap}</span>
            <div className="flex items-center gap-3">
              <div
                className="w-0.5 h-4 rounded-sm shrink-0"
                style={{ backgroundColor: teamColor }}
              />
              <span className="font-medium">{ps.driver.surname}</span>
            </div>
            <span className="text-right font-mono text-f1-orange">{ps.stop_number}</span>
            <span className="text-right font-mono">{formatPitDuration(ps.duration_ms)}</span>
          </div>
        );
      })}
    </div>
  );
}
