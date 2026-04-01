"use client";

import { useState } from "react";
import Link from "next/link";
import { getTeamColor } from "@/lib/constants/teams";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { useStandings } from "@/lib/hooks/use-standings";
import { SeasonSelector } from "@/components/season-selector";
import { cn } from "@/lib/utils";

export default function DriversPage() {
  const [season, setSeason] = useState(CURRENT_SEASON);
  const { data, isLoading, error } = useStandings(season, "driver");
  const drivers = data?.driver_standings ?? [];

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Drivers</h1>
          <SeasonSelector value={season} onChange={setSeason} />
        </div>
        <p className="text-f1-muted text-sm mt-1">
          {drivers.length > 0 ? `${drivers.length} drivers` : ""}
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="border border-f1-grid bg-f1-dark-2 p-4 rounded-sm h-32 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-f1-red text-sm">Failed to load drivers</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl">
          {drivers.map((d) => {
            const teamColor = getTeamColor(d.constructor_name ?? "");

            return (
              <Link
                key={d.driver_ref}
                href={`/drivers/${d.driver_ref}`}
                className="group border border-f1-grid bg-f1-dark-2 p-4 rounded-sm transition-colors duration-150 hover:bg-f1-dark-3"
                style={{ borderLeftColor: teamColor, borderLeftWidth: "3px" }}
              >
                <div className="flex items-baseline justify-between mb-2">
                  <div>
                    <span className="text-f1-muted text-sm">{d.forename} </span>
                    <span className="font-semibold uppercase text-sm">{d.surname}</span>
                  </div>
                  <span className={cn(
                    "font-mono text-base font-bold",
                    d.position === 1 ? "text-f1-gold" : d.position <= 3 ? "text-f1-text" : "text-f1-muted/30"
                  )}>
                    P{d.position}
                  </span>
                </div>

                <p className="text-xs mb-3" style={{ color: teamColor }}>
                  {d.constructor_name}
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-f1-muted uppercase tracking-wider">Points</p>
                    <p className="font-mono text-sm font-semibold">{Math.floor(d.points)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-f1-muted uppercase tracking-wider">Wins</p>
                    <p className="font-mono text-sm font-semibold">{d.wins}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
