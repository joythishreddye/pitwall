"use client";

import { m } from "motion/react";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { useStandings, useStandingsProgression } from "@/lib/hooks/use-standings";
import { useRaceCalendar } from "@/lib/hooks/use-races";
import { ScannerLine } from "@/components/ui/scanner-line";
import {
  ChampionshipLeaderTile,
  ConstructorLeaderTile,
  NextRaceTile,
  Top5Strip,
  RecentResultsTimeline,
  ChartPreview,
} from "@/components/home";

/** Stagger container — direct m.div children pick up staggerChildren timing */
const gridVariants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.04 },
  },
};

/** Shared per-tile enter animation — applied to each m.div wrapper in the grid */
const tileVariant = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" as const } },
};

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

  return (
    <div className="relative min-h-screen">
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

        {/* Bento grid — each m.div is a direct child so staggerChildren works */}
        <m.div
          variants={gridVariants}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 md:grid-cols-4 gap-3"
        >
          {/* Championship Leader — 2 cols wide, 2 rows tall */}
          {leader ? (
            <m.div variants={tileVariant} className="md:col-span-2 md:row-span-2">
              <ChampionshipLeaderTile leader={leader} />
            </m.div>
          ) : (
            <SkeletonTile className="md:col-span-2 md:row-span-2 min-h-[200px]" />
          )}

          {/* Constructor Leader */}
          {constructorLeader ? (
            <m.div variants={tileVariant} className="md:col-span-2">
              <ConstructorLeaderTile leader={constructorLeader} />
            </m.div>
          ) : (
            <SkeletonTile className="md:col-span-2" />
          )}

          {/* Next Race */}
          {nextRace ? (
            <m.div variants={tileVariant} className="md:col-span-2">
              <NextRaceTile race={nextRace} />
            </m.div>
          ) : (
            <SkeletonTile className="md:col-span-2" />
          )}

          {/* Top 5 strip — full width */}
          {standings?.driver_standings ? (
            <m.div variants={tileVariant} className="md:col-span-4">
              <Top5Strip standings={standings.driver_standings} />
            </m.div>
          ) : (
            <SkeletonTile className="md:col-span-4 min-h-[80px]" />
          )}

          {/* Recent Results — full width */}
          {pastRaces.length > 0 && (
            <m.div variants={tileVariant} className="md:col-span-4">
              <RecentResultsTimeline races={pastRaces} />
            </m.div>
          )}

          {/* Championship Progression chart — full width */}
          {progression && progression.length > 0 && (
            <m.div variants={tileVariant} className="md:col-span-4">
              <ChartPreview progressions={progression} />
            </m.div>
          )}
        </m.div>
      </div>
    </div>
  );
}

function SkeletonTile({ className }: { className?: string }) {
  return (
    <m.div
      variants={tileVariant}
      className={`bg-f1-dark-2 border border-f1-grid min-h-[120px] relative overflow-hidden${className ? ` ${className}` : ""}`}
    >
      <ScannerLine className="absolute top-0 left-0 right-0" />
    </m.div>
  );
}
