"use client";

import Link from "next/link";
import { Trophy, Flag, Calendar, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTeamColor } from "@/lib/constants/teams";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { useStandings } from "@/lib/hooks/use-standings";
import { useRaceCalendar, useRaceDetail } from "@/lib/hooks/use-races";

export default function HomePage() {
  const { data: standings } = useStandings(CURRENT_SEASON);
  const { data: races } = useRaceCalendar(CURRENT_SEASON);

  const leader = standings?.driver_standings?.[0];
  const constructorLeader = standings?.constructor_standings?.[0];

  const now = new Date();
  const pastRaces = races?.filter((r) => new Date(r.date + "T00:00:00") < now) ?? [];
  const lastRace = pastRaces[pastRaces.length - 1];
  const nextRace = races?.find((r) => new Date(r.date + "T00:00:00") >= now);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">PitWall</h1>
        <p className="text-f1-muted text-sm mt-1">
          {CURRENT_SEASON} Season{standings ? ` — Round ${standings.round}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl">
        {/* Championship Leader */}
        <Link
          href="/standings"
          className="border border-f1-grid bg-f1-dark-2 p-5 rounded-sm hover:bg-f1-dark-3 transition-colors duration-150"
        >
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-4 w-4 text-f1-gold" />
            <span className="text-xs text-f1-muted uppercase tracking-wider">Championship Leader</span>
          </div>
          {leader ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-0.5 h-8 rounded-sm"
                  style={{ backgroundColor: getTeamColor(leader.constructor_name ?? "") }}
                />
                <div>
                  <p className="font-semibold">
                    <span className="text-f1-muted font-normal">{leader.forename} </span>
                    <span className="uppercase">{leader.surname}</span>
                  </p>
                  <p className="text-xs text-f1-muted">{leader.constructor_name}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-2xl font-bold">{Math.floor(leader.points)}</p>
                <p className="text-xs text-f1-muted font-mono">{leader.wins} wins</p>
              </div>
            </div>
          ) : (
            <div className="h-10 bg-f1-grid/30 rounded-sm animate-pulse" />
          )}
        </Link>

        {/* Constructor Leader */}
        <Link
          href="/standings"
          className="border border-f1-grid bg-f1-dark-2 p-5 rounded-sm hover:bg-f1-dark-3 transition-colors duration-150"
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-f1-cyan" />
            <span className="text-xs text-f1-muted uppercase tracking-wider">Constructor Leader</span>
          </div>
          {constructorLeader ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-0.5 h-8 rounded-sm"
                  style={{ backgroundColor: getTeamColor(constructorLeader.constructor_ref) }}
                />
                <div>
                  <p className="font-semibold">{constructorLeader.name}</p>
                  <p className="text-xs text-f1-muted">{constructorLeader.nationality}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-2xl font-bold">{Math.floor(constructorLeader.points)}</p>
                <p className="text-xs text-f1-muted font-mono">{constructorLeader.wins} wins</p>
              </div>
            </div>
          ) : (
            <div className="h-10 bg-f1-grid/30 rounded-sm animate-pulse" />
          )}
        </Link>

        {/* Last Race */}
        {lastRace && (
          <Link
            href={`/races/${lastRace.id}`}
            className="border border-f1-grid bg-f1-dark-2 p-5 rounded-sm hover:bg-f1-dark-3 transition-colors duration-150"
          >
            <div className="flex items-center gap-2 mb-3">
              <Flag className="h-4 w-4 text-f1-red" />
              <span className="text-xs text-f1-muted uppercase tracking-wider">Last Race</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{lastRace.name}</p>
                <p className="text-xs text-f1-muted">{lastRace.circuit.name} — Round {lastRace.round}</p>
              </div>
              <span className="font-mono text-xs text-f1-muted">{lastRace.date}</span>
            </div>
            <LastRaceWinner raceId={lastRace.id} />
          </Link>
        )}

        {/* Next Race */}
        {nextRace ? (
          <div className="border border-f1-grid bg-f1-dark-2 p-5 rounded-sm">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-f1-green" />
              <span className="text-xs text-f1-muted uppercase tracking-wider">Next Race</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{nextRace.name}</p>
                <p className="text-xs text-f1-muted">{nextRace.circuit.name} — {nextRace.circuit.country}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm">{nextRace.date}</p>
                <p className="text-xs text-f1-muted">Round {nextRace.round}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-f1-grid bg-f1-dark-2 p-5 rounded-sm">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-f1-muted" />
              <span className="text-xs text-f1-muted uppercase tracking-wider">Season Complete</span>
            </div>
            <p className="text-f1-muted text-sm">All {races?.length ?? 0} rounds completed</p>
          </div>
        )}

        {/* Top 5 Drivers */}
        {standings?.driver_standings && (
          <Link
            href="/standings"
            className="border border-f1-grid bg-f1-dark-2 p-5 rounded-sm hover:bg-f1-dark-3 transition-colors duration-150 md:col-span-2"
          >
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-4 w-4 text-f1-muted" />
              <span className="text-xs text-f1-muted uppercase tracking-wider">Top 5 Drivers</span>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {standings.driver_standings.slice(0, 5).map((d) => {
                const teamColor = getTeamColor(d.constructor_name ?? "");
                return (
                  <div key={d.driver_ref} className="flex items-center gap-2">
                    <div
                      className="w-0.5 h-6 rounded-sm shrink-0"
                      style={{ backgroundColor: teamColor }}
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-xs uppercase truncate">{d.surname}</p>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold">{Math.floor(d.points)}</span>
                        <span className={cn(
                          "font-mono text-[10px]",
                          d.position === 1 ? "text-f1-gold" : "text-f1-muted"
                        )}>
                          P{d.position}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

function LastRaceWinner({ raceId }: { raceId: number }) {
  const { data: race } = useRaceDetail(raceId);
  const winner = race?.results[0];

  if (!winner) return null;

  const teamColor = getTeamColor(winner.constructor.ref);

  return (
    <div className="mt-3 pt-3 border-t border-f1-grid/50 flex items-center gap-3">
      <div className="w-0.5 h-5 rounded-sm" style={{ backgroundColor: teamColor }} />
      <span className="text-xs">
        <span className="text-f1-gold font-mono font-bold mr-1">P1</span>
        <span className="text-f1-muted">{winner.driver.forename} </span>
        <span className="font-semibold uppercase">{winner.driver.surname}</span>
      </span>
      <span className="text-xs text-f1-muted ml-auto">{winner.constructor.name}</span>
    </div>
  );
}
