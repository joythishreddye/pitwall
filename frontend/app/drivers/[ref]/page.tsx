"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTeamColor } from "@/lib/constants/teams";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { MOCK_DRIVERS, MOCK_DRIVER_RESULTS } from "@/lib/mock/drivers";

export default function DriverProfilePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = use(params);
  const driver = MOCK_DRIVERS[ref];
  const results = MOCK_DRIVER_RESULTS;

  if (!driver) {
    return (
      <div className="p-8">
        <Link
          href="/drivers"
          className="inline-flex items-center gap-1.5 text-f1-muted text-sm hover:text-f1-text transition-colors duration-150 mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Standings
        </Link>
        <p className="text-f1-muted">Driver not found.</p>
      </div>
    );
  }

  const teamColor = getTeamColor(driver.constructorRef);

  const stats = [
    { label: "Championships", value: driver.championships },
    { label: "Wins", value: driver.wins },
    { label: "Podiums", value: driver.podiums },
    { label: "Poles", value: driver.poles },
    { label: "Fastest Laps", value: driver.fastestLaps },
    { label: "Career Points", value: driver.points },
  ];

  return (
    <div className="p-8">
      {/* Back link */}
      <Link
        href="/drivers"
        className="inline-flex items-center gap-1.5 text-f1-muted text-sm hover:text-f1-text transition-colors duration-150 mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Standings
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div
          className="w-1 h-12 rounded-sm shrink-0"
          style={{ backgroundColor: teamColor }}
        />
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="text-f1-muted font-normal">{driver.givenName}</span>{" "}
              <span className="uppercase">{driver.familyName}</span>
            </h1>
            <span className="font-mono text-2xl text-f1-muted/50 font-bold">
              {driver.permanentNumber}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-f1-muted">
            <span style={{ color: teamColor }}>{driver.constructorName}</span>
            <span className="text-f1-grid">|</span>
            <span>{driver.nationality}</span>
            <span className="text-f1-grid">|</span>
            <span>DOB: {driver.dateOfBirth}</span>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {stats.map(({ label, value }) => (
          <div
            key={label}
            className="border border-f1-grid bg-f1-dark-2 p-3 rounded-sm"
          >
            <p className="text-xs text-f1-muted uppercase tracking-wider mb-1">
              {label}
            </p>
            <p className="font-mono text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {/* Recent results */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-4">
          {CURRENT_SEASON} Results
        </h2>

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
            const gridDelta = r.grid - r.position;

            return (
              <div
                key={r.round}
                className={cn(
                  "grid grid-cols-[3rem_1fr_7rem_3.5rem_3rem_4rem] gap-x-4 items-center px-4 h-11 text-sm border-b border-f1-grid/50 transition-colors duration-100 hover:bg-f1-dark-3",
                  i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3"
                )}
              >
                <span className="font-mono text-f1-muted">{r.round}</span>
                <span className="font-medium">{r.raceName}</span>
                <span className="font-mono text-xs text-f1-muted">
                  {new Date(r.date).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
                <span className="text-right font-mono text-f1-muted">
                  {r.grid}
                </span>
                <div className="text-right flex items-center justify-end gap-1">
                  <span
                    className={cn(
                      "font-mono font-semibold",
                      r.position === 1 && "text-f1-green"
                    )}
                  >
                    {r.position}
                  </span>
                  {gridDelta !== 0 && (
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
                  {r.points > 0 ? r.points : "\u2014"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
