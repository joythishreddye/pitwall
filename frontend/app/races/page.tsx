import Link from "next/link";
import { cn } from "@/lib/utils";
import { getTeamColor } from "@/lib/constants/teams";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { MOCK_RACES } from "@/lib/mock/races";

export default function RacesPage() {
  const races = MOCK_RACES;
  const now = new Date();

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Race Calendar</h1>
        <p className="text-f1-muted text-sm mt-1">{CURRENT_SEASON} Season — {races.length} races</p>
      </div>

      <div className="w-full">
        {/* Column headers */}
        <div className="sticky top-0 z-10 grid grid-cols-[3rem_1fr_1fr_7rem_1fr] gap-x-4 px-4 py-2 text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark">
          <span>Rnd</span>
          <span>Grand Prix</span>
          <span>Circuit</span>
          <span>Date</span>
          <span>Winner</span>
        </div>

        {races.map((race, i) => {
          const raceDate = new Date(race.date);
          const isPast = raceDate < now;
          const teamColor = race.winnerConstructor
            ? getTeamColor(race.winnerConstructor)
            : undefined;

          return (
            <Link
              key={race.id}
              href={`/races/${race.id}`}
              className={cn(
                "grid grid-cols-[3rem_1fr_1fr_7rem_1fr] gap-x-4 items-center px-4 h-11 text-sm border-b border-f1-grid/50 transition-colors duration-100 hover:bg-f1-dark-3",
                i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3"
              )}
            >
              {/* Round */}
              <span className="font-mono text-f1-muted">{race.round}</span>

              {/* Race name + country */}
              <div>
                <span className="font-medium">{race.raceName}</span>
                <span className="text-f1-muted text-xs ml-2">{race.country}</span>
              </div>

              {/* Circuit */}
              <span className="text-f1-muted text-xs">{race.circuitName}</span>

              {/* Date */}
              <span className="font-mono text-xs text-f1-muted">
                {raceDate.toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>

              {/* Winner */}
              {isPast && race.winnerName ? (
                <div className="flex items-center gap-2">
                  <div
                    className="w-0.5 h-4 rounded-sm shrink-0"
                    style={{ backgroundColor: teamColor }}
                  />
                  <span className="text-xs">{race.winnerName}</span>
                </div>
              ) : (
                <span className="text-xs text-f1-muted italic">Upcoming</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
