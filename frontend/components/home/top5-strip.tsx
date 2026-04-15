"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { NumberCounter } from "@/components/ui/number-counter";
import { getTeamHexColor } from "@/lib/constants/teams";
import type { DriverStanding } from "@/lib/schemas/standings";

interface Top5StripProps {
  standings: DriverStanding[];
}

const POSITION_COLORS: Record<number, string> = {
  1: "var(--color-f1-gold)",
  2: "var(--color-f1-silver)",
  3: "var(--color-f1-bronze)",
};

export function Top5Strip({ standings }: Top5StripProps) {
  const top5 = standings.slice(0, 5);

  return (
    <div className="bg-f1-dark-2 border border-f1-grid">
      <Link href="/standings" className="block hover:bg-f1-dark-3 transition-colors duration-100 cursor-pointer">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-f1-grid">
          <Trophy className="h-4 w-4 text-f1-muted" />
          <span className="text-xs text-f1-muted uppercase tracking-widest">Drivers Championship — Top 5</span>
        </div>

        {/* Drivers row — scrollable on mobile, 5-col grid on desktop */}
        <div className="flex overflow-x-auto divide-x divide-f1-grid md:grid md:grid-cols-5 md:overflow-visible">
          {top5.map((driver) => {
            const teamHex = getTeamHexColor(driver.constructor_name ?? "");
            const posColor = POSITION_COLORS[driver.position] ?? "var(--color-f1-muted)";

            return (
              <div key={driver.driver_ref} className="px-4 py-3 flex items-center gap-2.5 shrink-0 md:shrink w-[160px] md:w-auto">
                {/* Position + team color bar */}
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="font-data text-sm font-bold"
                    style={{ color: posColor }}
                  >
                    P{driver.position}
                  </span>
                  <div className="w-0.5 h-6 shrink-0" style={{ backgroundColor: teamHex }} />
                </div>

                {/* Name + points */}
                <div className="min-w-0">
                  <p className="font-heading text-sm font-bold uppercase truncate text-f1-text">
                    {driver.surname}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="font-data text-base font-bold" style={{ color: teamHex }}>
                      <NumberCounter value={driver.points} duration={0.8 + driver.position * 0.05} />
                    </span>
                    <span className="font-data text-[10px] text-f1-muted">PTS</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Link>
    </div>
  );
}
