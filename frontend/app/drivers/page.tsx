import Link from "next/link";
import { getTeamColor } from "@/lib/constants/teams";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { MOCK_DRIVERS } from "@/lib/mock/drivers";

export default function DriversPage() {
  const drivers = Object.values(MOCK_DRIVERS).sort((a, b) => b.points - a.points);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Drivers</h1>
        <p className="text-f1-muted text-sm mt-1">{CURRENT_SEASON} Grid</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl">
        {drivers.map((d) => {
          const teamColor = getTeamColor(d.constructorRef);

          return (
            <Link
              key={d.driverRef}
              href={`/drivers/${d.driverRef}`}
              className="group border border-f1-grid bg-f1-dark-2 p-4 rounded-sm transition-colors duration-150 hover:bg-f1-dark-3"
              style={{ borderLeftColor: teamColor, borderLeftWidth: "3px" }}
            >
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <span className="text-f1-muted text-sm">{d.givenName} </span>
                  <span className="font-semibold uppercase text-sm">
                    {d.familyName}
                  </span>
                </div>
                <span className="font-mono text-xl text-f1-muted/30 font-bold">
                  {d.permanentNumber}
                </span>
              </div>

              <p className="text-xs mb-3" style={{ color: teamColor }}>
                {d.constructorName}
              </p>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] text-f1-muted uppercase tracking-wider">
                    Wins
                  </p>
                  <p className="font-mono text-sm font-semibold">{d.wins}</p>
                </div>
                <div>
                  <p className="text-[10px] text-f1-muted uppercase tracking-wider">
                    Podiums
                  </p>
                  <p className="font-mono text-sm font-semibold">{d.podiums}</p>
                </div>
                <div>
                  <p className="text-[10px] text-f1-muted uppercase tracking-wider">
                    Points
                  </p>
                  <p className="font-mono text-sm font-semibold">{d.points}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
