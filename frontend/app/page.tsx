"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { useStandings, useStandingsProgression } from "@/lib/hooks/use-standings";
import { useRaceCalendar } from "@/lib/hooks/use-races";
import { raceStart } from "@/lib/hooks/use-countdown";
import { DataLinkDown } from "@/components/data-link-down";
import { ScannerLine } from "@/components/ui/scanner-line";
import { gsap, useGSAP } from "@/lib/gsap";
import {
  ChampionshipLeaderTile,
  ConstructorLeaderTile,
  NextRaceTile,
  Top5Strip,
  RecentResultsTimeline,
  ChartPreview,
} from "@/components/home";

type TileId = "leader" | "constructor" | "next-race" | "top5" | "recent" | "chart";

export default function HomePage() {
  const standingsQuery = useStandings(CURRENT_SEASON);
  const racesQuery = useRaceCalendar(CURRENT_SEASON);
  const {
    data: standings,
    isFetching: standingsFetching,
    refetch: refetchStandings,
  } = standingsQuery;
  const { data: races, isFetching: racesFetching, refetch: refetchRaces } = racesQuery;
  const { data: progression, refetch: refetchProgression } =
    useStandingsProgression(CURRENT_SEASON);

  // Each request has answered at least once, with data or an error. These, unlike the error and loading
  // flags, hold through a retry: a refetch with no data clears the error and goes back to pending, which would
  // unmount the notice and restart its limited auto-retries from zero on every failure.
  const answered = (q: { dataUpdatedAt: number; errorUpdateCount: number }) =>
    q.dataUpdatedAt > 0 || q.errorUpdateCount > 0;
  const allLoaded = answered(standingsQuery) && answered(racesQuery);
  const hasData = Boolean(standings || races);
  const standingsFailed = !standings && standingsQuery.errorUpdateCount > 0;
  const racesFailed = !races && racesQuery.errorUpdateCount > 0;
  const linkDown = allLoaded && (standingsFailed || racesFailed);
  // One request failed and the other arrived: say which part is missing, above the tiles that loaded
  const partialMessage = !linkDown || !hasData
    ? null
    : !standings
      ? "The standings aren't reaching the pit wall right now. The race calendar loaded."
      : !races
        ? "The race calendar isn't reaching the pit wall right now. The standings loaded."
        : null;

  const retryDataLink = useCallback(() => {
    void refetchStandings();
    void refetchRaces();
    void refetchProgression();
  }, [refetchStandings, refetchRaces, refetchProgression]);

  const leader = standings?.driver_standings?.[0];
  const constructorLeader = standings?.constructor_standings?.[0];
  const now = new Date();
  // A race moves from next to recent when its lights go out (its UTC start time), not at midnight
  // of its day in the reader's zone: east of UTC that midnight comes a day early
  const pastRaces = races?.filter((r) => r.date && raceStart(r.date, r.time) < now.getTime()) ?? [];
  const nextRace = races?.find((r) => r.date && raceStart(r.date, r.time) >= now.getTime());

  const containerRef = useRef<HTMLDivElement>(null);

  // `revealedTiles` drives each tile's own entrance (state, read in render).
  // `scheduledRef` records tiles the cascade has already queued, so a later
  // data arrival never tweens them twice. It's only touched inside the GSAP
  // effect, never during render.
  const [revealedTiles, setRevealedTiles] = useState<Set<TileId>>(new Set());
  const scheduledRef = useRef<Set<TileId>>(new Set());

  // useGSAP reverts its tweens on unmount, putting tiles back to opacity 0.
  // Forget what was scheduled too, or a remount (Strict Mode, Fast Refresh)
  // would skip every tile and leave the page blank.
  useEffect(() => {
    const scheduled = scheduledRef.current;
    return () => scheduled.clear();
  }, []);

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

      const scheduled = scheduledRef.current;
      const tiles = gsap.utils
        .toArray<HTMLElement>("[data-tile-id]")
        .filter((el) => !scheduled.has(el.dataset.tileId as TileId));
      if (tiles.length === 0) return;
      const firstReveal = scheduled.size === 0;
      const ids = tiles.map((el) => el.dataset.tileId as TileId);
      ids.forEach((id) => scheduled.add(id));

      // Tiles show at once: the old cascade ran past a second, and text must be
      // settled when it appears (DESIGN.md, Motion). Only the tiles on screen
      // now; tiles that mount later get their turn.
      gsap.set(tiles, { opacity: 1, y: 0, scale: 1 });
      if (firstReveal) gsap.set(".home-subtext", { opacity: 1 });
      setRevealedTiles((prev) => new Set([...prev, ...ids]));
    },
    { scope: containerRef, dependencies: [shouldAnimate, standings, races, progression] }
  );

  return (
    <div ref={containerRef} className="relative min-h-screen">
      <div className="absolute inset-0 bg-grid-lines opacity-40 pointer-events-none" />

      <div className="relative p-6 md:p-8 space-y-3">
        {/* Page header: the subtext shows once data has arrived */}
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-bold text-f1-text tracking-tight">Race Control</h1>
          <p className="home-subtext text-f1-muted text-sm mt-0.5 font-data" style={{ opacity: 0 }}>
            {CURRENT_SEASON} Season
            {standings ? ` — After Round ${standings.round}` : ""}
          </p>
        </div>

        {/* Loading indicator */}
        {!allLoaded && (
          <div className="flex flex-col items-center justify-center py-32 gap-3">
            <ScannerLine className="w-full max-w-md" />
            <p className="font-data text-[11px] text-f1-muted tracking-widest uppercase">
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

        {/* Part of the data didn't arrive */}
        {partialMessage && (
          <div className="pb-3">
            <DataLinkDown
              message={partialMessage}
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
