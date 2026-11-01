"use client";

import { useCallback, useRef, useState } from "react";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { useStandings, useStandingsProgression } from "@/lib/hooks/use-standings";
import { useRaceCalendar } from "@/lib/hooks/use-races";
import { DataLinkDown } from "@/components/data-link-down";
import { ScannerLine } from "@/components/ui/scanner-line";
import { SplitReveal } from "@/components/ui/split-reveal";
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
const TILE_STAGGER = 0.1;
// Delay before first tile starts (after data loads)
const TILE_INITIAL_DELAY = 0.15;

export default function HomePage() {
  const {
    data: standings,
    isLoading: standingsLoading,
    error: standingsError,
    isFetching: standingsFetching,
    refetch: refetchStandings,
  } = useStandings(CURRENT_SEASON);
  const {
    data: races,
    isLoading: racesLoading,
    error: racesError,
    isFetching: racesFetching,
    refetch: refetchRaces,
  } = useRaceCalendar(CURRENT_SEASON);
  const { data: progression, refetch: refetchProgression } =
    useStandingsProgression(CURRENT_SEASON);

  const allLoaded = !standingsLoading && !racesLoading;
  const hasData = Boolean(standings || races);
  const linkDown = allLoaded && Boolean(standingsError || racesError);

  const retryDataLink = useCallback(() => {
    void refetchStandings();
    void refetchRaces();
    void refetchProgression();
  }, [refetchStandings, refetchRaces, refetchProgression]);

  const leader = standings?.driver_standings?.[0];
  const constructorLeader = standings?.constructor_standings?.[0];
  const now = new Date();
  const pastRaces = races?.filter((r) => r.date && new Date(r.date + "T00:00:00") < now) ?? [];
  const nextRace = races?.find((r) => r.date && new Date(r.date + "T00:00:00") >= now);

  const containerRef = useRef<HTMLDivElement>(null);

  const [revealedTiles, setRevealedTiles] = useState<Set<TileId>>(new Set());

  // True once real data has arrived. Query data stays cached after its first
  // success, so this never flips back. (It keys on data, not on loading
  // finishing: a failed load must not start the reveal, or tiles that arrive
  // on a retry would stay hidden.)
  const shouldAnimate = hasData;

  // Phase 2 — tile cascade. Re-runs whenever data arrives, because queries can
  // land at different times (progression, or a recovered data link); only
  // tiles that haven't revealed yet animate.
  useGSAP(
    () => {
      if (!shouldAnimate) return;

      const tiles = gsap.utils
        .toArray<HTMLElement>("[data-tile-id]")
        .filter((el) => !revealedTiles.has(el.dataset.tileId as TileId));
      if (tiles.length === 0) return;
      const firstReveal = revealedTiles.size === 0;

      if (respectsReducedMotion()) {
        gsap.set(tiles, { opacity: 1, y: 0, scale: 1 });
        gsap.set(".home-subtext", { opacity: 1 });
        setRevealedTiles(new Set(ALL_TILE_IDS));
        return;
      }

      const tl = gsap.timeline();

      // Subheading fades in first — signals data is ready
      if (firstReveal) {
        tl.fromTo(
          ".home-subtext",
          { opacity: 0 },
          { opacity: 1, duration: 0.35, ease: "pitwall-accel" },
          0
        );
      }

      tiles.forEach((el, i) => {
        const tileId = el.dataset.tileId as TileId;
        const isHero = tileId === "leader";

        tl.fromTo(
          el,
          {
            opacity: 0,
            y: isHero ? 0 : 10,
            scale: isHero ? 0.97 : 1,
          },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: isHero ? 0.45 : 0.3,
            ease: "pitwall-accel",
            onStart() {
              setRevealedTiles((prev) => new Set([...prev, tileId]));
            },
          },
          TILE_INITIAL_DELAY + i * TILE_STAGGER
        );
      });
    },
    { scope: containerRef, dependencies: [shouldAnimate, standings, races, progression] }
  );

  return (
    <div ref={containerRef} className="relative min-h-screen">
      <div className="absolute inset-0 bg-grid-lines opacity-40 pointer-events-none" />

      <div className="relative p-6 md:p-8 space-y-3">
        {/* Page header — heading sweeps in on mount; subtext reveals after data */}
        <div className="mb-6">
          <SplitReveal
            text="Race Control"
            type="chars"
            stagger={0.035}
            delay={0}
            duration={0.3}
            tag="h1"
            className="font-heading text-2xl font-bold text-f1-text tracking-tight"
          />
          <p className="home-subtext text-f1-muted text-sm mt-0.5 font-data" style={{ opacity: 0 }}>
            {CURRENT_SEASON} Season
            {standings ? ` — After Round ${standings.round}` : ""}
          </p>
        </div>

        {/* Loading indicator */}
        {!allLoaded && (
          <div className="flex flex-col items-center justify-center py-32 gap-3">
            <ScannerLine className="w-full max-w-md" />
            <p className="font-data text-[10px] text-f1-muted tracking-widest uppercase">
              Loading Race Data...
            </p>
          </div>
        )}

        {/* Data link down: the API couldn't be reached */}
        {linkDown && !hasData && (
          <div className="py-16">
            <DataLinkDown
              onRetry={retryDataLink}
              isRetrying={standingsFetching || racesFetching}
            />
          </div>
        )}

        {/* Grid — always mounted so GSAP can measure tiles on cached return visits */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">

          {leader && (
            <div data-tile-id="leader" className="md:col-span-2 md:row-span-2" style={{ opacity: 0 }}>
              <ChampionshipLeaderTile
                leader={leader}
                revealed={revealedTiles.has("leader")}
              />
            </div>
          )}

          {constructorLeader && (
            <div data-tile-id="constructor" className="md:col-span-2" style={{ opacity: 0 }}>
              <ConstructorLeaderTile
                leader={constructorLeader}
                revealed={revealedTiles.has("constructor")}
              />
            </div>
          )}

          {nextRace && (
            <div data-tile-id="next-race" className="md:col-span-2" style={{ opacity: 0 }}>
              <NextRaceTile
                race={nextRace}
                revealed={revealedTiles.has("next-race")}
              />
            </div>
          )}

          {standings?.driver_standings && (
            <div data-tile-id="top5" className="md:col-span-4" style={{ opacity: 0 }}>
              <Top5Strip standings={standings.driver_standings} />
            </div>
          )}

          {pastRaces.length > 0 && (
            <div data-tile-id="recent" className="md:col-span-4" style={{ opacity: 0 }}>
              <RecentResultsTimeline races={pastRaces} />
            </div>
          )}

          {progression && progression.length > 0 && (
            <div data-tile-id="chart" className="md:col-span-4" style={{ opacity: 0 }}>
              <ChartPreview
                progressions={progression}
                roundLabels={Object.fromEntries(
                  (races ?? []).map((r) => [r.round, r.circuit.country ?? `R${r.round}`])
                )}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
