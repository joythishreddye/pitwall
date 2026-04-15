"use client";

import { useRef } from "react";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { useStandings, useStandingsProgression } from "@/lib/hooks/use-standings";
import { useRaceCalendar } from "@/lib/hooks/use-races";
import { ScannerLine } from "@/components/ui/scanner-line";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import {
  ChampionshipLeaderTile,
  ConstructorLeaderTile,
  NextRaceTile,
  Top5Strip,
  RecentResultsTimeline,
  ChartPreview,
} from "@/components/home";

export default function HomePage() {
  const { data: standings, isLoading: standingsLoading } = useStandings(CURRENT_SEASON);
  const { data: races, isLoading: racesLoading } = useRaceCalendar(CURRENT_SEASON);
  const { data: progression } = useStandingsProgression(CURRENT_SEASON);

  const isLoading = standingsLoading || racesLoading;

  const leader = standings?.driver_standings?.[0];
  const constructorLeader = standings?.constructor_standings?.[0];

  const now = new Date();
  const pastRaces = races?.filter((r) => r.date && new Date(r.date + "T00:00:00") < now) ?? [];
  const nextRace = races?.find((r) => r.date && new Date(r.date + "T00:00:00") >= now);

  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  // GSAP master timeline — fires once when data is loaded
  useGSAP(
    () => {
      if (isLoading || hasAnimated.current) return;
      hasAnimated.current = true;

      if (respectsReducedMotion()) return;

      const tl = gsap.timeline();
      tl.from(".tile-leader", { opacity: 0, y: 12, duration: 0.3, ease: "pitwall-accel" })
        .from(".tile-constructor", { opacity: 0, y: 12, duration: 0.25 }, "-=0.15")
        .from(".tile-next-race", { opacity: 0, y: 12, duration: 0.25 }, "-=0.1")
        .from(".tile-top5", { opacity: 0, y: 8, duration: 0.2 }, "-=0.1")
        .from(".tile-recent", { opacity: 0, y: 8, duration: 0.2 }, "-=0.1")
        .from(".tile-chart", { opacity: 0, duration: 0.3 }, "-=0.05");
    },
    { scope: containerRef, dependencies: [isLoading] }
  );

  return (
    <div ref={containerRef} className="relative min-h-screen">
      {/* Grid-line background */}
      <div className="absolute inset-0 bg-grid-lines opacity-40 pointer-events-none" />

      {/* Content */}
      <div className="relative p-6 md:p-8 space-y-3">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-bold text-f1-text tracking-tight">Race Control</h1>
          <p className="text-f1-muted text-sm mt-0.5 font-data">
            {CURRENT_SEASON} Season
            {standings ? ` — After Round ${standings.round}` : ""}
          </p>
        </div>

        {/* Global loading scanner */}
        {isLoading && <ScannerLine className="mb-4" />}

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Championship Leader — 2 cols wide, 2 rows tall */}
          {leader ? (
            <div className="tile-leader md:col-span-2 md:row-span-2">
              <ChampionshipLeaderTile leader={leader} />
            </div>
          ) : (
            <SkeletonTile className="tile-leader md:col-span-2 md:row-span-2 min-h-[200px]" />
          )}

          {/* Constructor Leader */}
          {constructorLeader ? (
            <div className="tile-constructor md:col-span-2">
              <ConstructorLeaderTile leader={constructorLeader} />
            </div>
          ) : (
            <SkeletonTile className="tile-constructor md:col-span-2" />
          )}

          {/* Next Race */}
          {nextRace ? (
            <div className="tile-next-race md:col-span-2">
              <NextRaceTile race={nextRace} />
            </div>
          ) : (
            <SkeletonTile className="tile-next-race md:col-span-2" />
          )}

          {/* Top 5 strip — full width */}
          {standings?.driver_standings ? (
            <div className="tile-top5 md:col-span-4">
              <Top5Strip standings={standings.driver_standings} />
            </div>
          ) : (
            <SkeletonTile className="tile-top5 md:col-span-4 min-h-[80px]" />
          )}

          {/* Recent Results — full width */}
          {pastRaces.length > 0 && (
            <div className="tile-recent md:col-span-4">
              <RecentResultsTimeline races={pastRaces} />
            </div>
          )}

          {/* Championship Progression chart — full width */}
          {progression && progression.length > 0 && (
            <div className="tile-chart md:col-span-4">
              <ChartPreview progressions={progression} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonTile({ className }: { className?: string }) {
  return (
    <div
      className={`bg-f1-dark-2 border border-f1-grid min-h-[120px] relative overflow-hidden${className ? ` ${className}` : ""}`}
    >
      <ScannerLine className="absolute top-0 left-0 right-0" />
    </div>
  );
}
