"use client";

import { useEffect, useRef, useState } from "react";
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

const ALL_TILE_IDS = ["leader", "constructor", "next-race", "top5", "recent", "chart"] as const;
type TileId = (typeof ALL_TILE_IDS)[number];

// Stagger between each tile reveal (seconds)
const TILE_STAGGER = 0.08;

export default function HomePage() {
  const { data: standings, isLoading: standingsLoading } = useStandings(CURRENT_SEASON);
  const { data: races, isLoading: racesLoading } = useRaceCalendar(CURRENT_SEASON);
  const { data: progression } = useStandingsProgression(CURRENT_SEASON);

  const allLoaded = !standingsLoading && !racesLoading;

  const leader = standings?.driver_standings?.[0];
  const constructorLeader = standings?.constructor_standings?.[0];
  const now = new Date();
  const pastRaces = races?.filter((r) => r.date && new Date(r.date + "T00:00:00") < now) ?? [];
  const nextRace = races?.find((r) => r.date && new Date(r.date + "T00:00:00") >= now);

  const containerRef = useRef<HTMLDivElement>(null);

  const [revealedTiles, setRevealedTiles] = useState<Set<TileId>>(new Set());

  // Latches true the first time allLoaded becomes true — never flips back.
  // This means TanStack Query background refetches (isLoading briefly true)
  // cannot re-run or revert the animation after it has played.
  const [shouldAnimate, setShouldAnimate] = useState(false);
  useEffect(() => {
    if (allLoaded && !shouldAnimate) setShouldAnimate(true);
  }, [allLoaded, shouldAnimate]);

  useGSAP(
    () => {
      if (!shouldAnimate) return;

      const tiles = gsap.utils.toArray<HTMLElement>("[data-tile-id]");
      if (tiles.length === 0) return;

      // Reduced motion — reveal everything instantly
      if (respectsReducedMotion()) {
        gsap.set(tiles, { opacity: 1, y: 0 });
        setRevealedTiles(new Set(ALL_TILE_IDS));
        return;
      }

      // Hold all tiles invisible before the timeline starts
      gsap.set(tiles, { opacity: 0, y: 8 });

      const tl = gsap.timeline();

      tiles.forEach((el, i) => {
        const tileId = el.dataset.tileId as TileId;
        tl.fromTo(
          el,
          { opacity: 0, y: 8 },
          {
            opacity: 1,
            y: 0,
            duration: 0.3,
            ease: "pitwall-accel",
            onStart() {
              // Unpauses NumberCounter, DrawPath, SplitReveal inside this tile
              setRevealedTiles((prev) => new Set([...prev, tileId]));
            },
          },
          i * TILE_STAGGER
        );
      });
    },
    { scope: containerRef, dependencies: [shouldAnimate] }
  );

  return (
    <div ref={containerRef} className="relative min-h-screen">
      <div className="absolute inset-0 bg-grid-lines opacity-40 pointer-events-none" />

      <div className="relative p-6 md:p-8 space-y-3">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-bold text-f1-text tracking-tight">
            Race Control
          </h1>
          <p className="text-f1-muted text-sm mt-0.5 font-data">
            {CURRENT_SEASON} Season
            {standings ? ` — After Round ${standings.round}` : ""}
          </p>
        </div>

        {/* Loading indicator — full-width scanner, shown while any data pending */}
        {!allLoaded && (
          <div className="flex flex-col items-center justify-center py-32 gap-3">
            <ScannerLine className="w-full max-w-md" />
            <p className="font-data text-[10px] text-f1-muted tracking-widest uppercase">
              Loading Race Data...
            </p>
          </div>
        )}

        {/* Grid — always mounted so GSAP can measure tiles on cached return visits */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">

          {/* Championship Leader — 2 cols wide, 2 rows tall */}
          {leader && (
            <div data-tile-id="leader" className="md:col-span-2 md:row-span-2">
              <ChampionshipLeaderTile
                leader={leader}
                revealed={revealedTiles.has("leader")}
              />
            </div>
          )}

          {/* Constructor Leader */}
          {constructorLeader && (
            <div data-tile-id="constructor" className="md:col-span-2">
              <ConstructorLeaderTile
                leader={constructorLeader}
                revealed={revealedTiles.has("constructor")}
              />
            </div>
          )}

          {/* Next Race */}
          {nextRace && (
            <div data-tile-id="next-race" className="md:col-span-2">
              <NextRaceTile
                race={nextRace}
                revealed={revealedTiles.has("next-race")}
              />
            </div>
          )}

          {/* Top 5 strip — full width */}
          {standings?.driver_standings && (
            <div data-tile-id="top5" className="md:col-span-4">
              <Top5Strip standings={standings.driver_standings} />
            </div>
          )}

          {/* Recent Results — full width */}
          {pastRaces.length > 0 && (
            <div data-tile-id="recent" className="md:col-span-4">
              <RecentResultsTimeline races={pastRaces} />
            </div>
          )}

          {/* Championship Progression chart — full width */}
          {progression && progression.length > 0 && (
            <div data-tile-id="chart" className="md:col-span-4">
              <ChartPreview progressions={progression} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
