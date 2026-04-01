"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { getTeamColor } from "@/lib/constants/teams";
import { CURRENT_SEASON } from "@/lib/constants/season";
import {
  MOCK_DRIVER_STANDINGS,
  MOCK_CONSTRUCTOR_STANDINGS,
} from "@/lib/mock/standings";

type Tab = "drivers" | "constructors";

export default function StandingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("drivers");
  const drivers = MOCK_DRIVER_STANDINGS;
  const constructors = MOCK_CONSTRUCTOR_STANDINGS;
  const maxPoints =
    activeTab === "drivers" ? drivers[0].points : constructors[0].points;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Championship Standings
        </h1>
        <p className="text-f1-muted text-sm mt-1">{CURRENT_SEASON} Season</p>
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

      {/* Table */}
      {activeTab === "drivers" ? (
        <DriverTable drivers={drivers} maxPoints={maxPoints} />
      ) : (
        <ConstructorTable
          constructors={constructors}
          maxPoints={maxPoints}
        />
      )}
    </div>
  );
}

function DriverTable({
  drivers,
  maxPoints,
}: {
  drivers: typeof MOCK_DRIVER_STANDINGS;
  maxPoints: number;
}) {
  return (
    <div className="w-full">
      {/* Column headers */}
      <div className="sticky top-0 z-10 grid grid-cols-[3rem_2fr_1fr_5rem_4rem_1fr] gap-x-4 px-4 py-2 text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark">
        <span>Pos</span>
        <span>Driver</span>
        <span>Team</span>
        <span className="text-right">Pts</span>
        <span className="text-right">Wins</span>
        <span />
      </div>

      {drivers.map((d, i) => {
        const teamColor = getTeamColor(d.constructorRef);
        const barWidth = maxPoints > 0 ? (d.points / maxPoints) * 100 : 0;

        return (
          <div
            key={d.driverRef}
            className={cn(
              "grid grid-cols-[3rem_2fr_1fr_5rem_4rem_1fr] gap-x-4 items-center px-4 h-11 text-sm border-b border-f1-grid/50 transition-colors duration-100 hover:bg-f1-dark-3",
              i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3"
            )}
          >
            {/* Position */}
            <span
              className={cn(
                "font-mono text-base font-bold",
                d.position <= 3 ? "text-f1-text" : "text-f1-muted"
              )}
            >
              {d.position}
            </span>

            {/* Driver name with team color bar */}
            <div className="flex items-center gap-3">
              <div
                className="w-0.5 h-5 rounded-sm shrink-0"
                style={{ backgroundColor: teamColor }}
              />
              <span>
                <span className="text-f1-muted">{d.givenName} </span>
                <span className="font-semibold uppercase">
                  {d.familyName}
                </span>
              </span>
            </div>

            {/* Team */}
            <span className="text-f1-muted text-xs">{d.constructorName}</span>

            {/* Points */}
            <span className="text-right font-mono font-semibold">
              {d.points}
            </span>

            {/* Wins */}
            <span className="text-right font-mono text-f1-muted">
              {d.wins > 0 ? d.wins : "\u2014"}
            </span>

            {/* Points bar */}
            <div className="h-1.5 bg-f1-grid/30 rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-300"
                style={{
                  width: `${barWidth}%`,
                  backgroundColor: teamColor,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConstructorTable({
  constructors,
  maxPoints,
}: {
  constructors: typeof MOCK_CONSTRUCTOR_STANDINGS;
  maxPoints: number;
}) {
  return (
    <div className="w-full">
      {/* Column headers */}
      <div className="sticky top-0 z-10 grid grid-cols-[3rem_2fr_5rem_4rem_1fr] gap-x-4 px-4 py-2 text-xs text-f1-muted uppercase tracking-wider border-b border-f1-grid bg-f1-dark">
        <span>Pos</span>
        <span>Constructor</span>
        <span className="text-right">Pts</span>
        <span className="text-right">Wins</span>
        <span />
      </div>

      {constructors.map((c, i) => {
        const teamColor = getTeamColor(c.constructorRef);
        const barWidth = maxPoints > 0 ? (c.points / maxPoints) * 100 : 0;

        return (
          <div
            key={c.constructorRef}
            className={cn(
              "grid grid-cols-[3rem_2fr_5rem_4rem_1fr] gap-x-4 items-center px-4 h-11 text-sm border-b border-f1-grid/50 transition-colors duration-100 hover:bg-f1-dark-3",
              i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3"
            )}
          >
            {/* Position */}
            <span
              className={cn(
                "font-mono text-base font-bold",
                c.position <= 3 ? "text-f1-text" : "text-f1-muted"
              )}
            >
              {c.position}
            </span>

            {/* Constructor name with team color bar */}
            <div className="flex items-center gap-3">
              <div
                className="w-0.5 h-5 rounded-sm shrink-0"
                style={{ backgroundColor: teamColor }}
              />
              <span className="font-semibold">{c.constructorName}</span>
            </div>

            {/* Points */}
            <span className="text-right font-mono font-semibold">
              {c.points}
            </span>

            {/* Wins */}
            <span className="text-right font-mono text-f1-muted">
              {c.wins > 0 ? c.wins : "\u2014"}
            </span>

            {/* Points bar */}
            <div className="h-2 bg-f1-grid/30 rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-300"
                style={{
                  width: `${barWidth}%`,
                  backgroundColor: teamColor,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
