"use client";

import { useRef, useState } from "react";
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

// All tile IDs used in the scanner sweep
const ALL_TILE_IDS = ["leader", "constructor", "next-race", "top5", "recent", "chart"] as const;
type TileId = (typeof ALL_TILE_IDS)[number];

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
  const gridRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  const [revealedTiles, setRevealedTiles] = useState<Set<TileId>>(new Set());

  useGSAP(
    () => {
      if (!allLoaded || hasAnimated.current) return;
      hasAnimated.current = true;

      const gridEl = gridRef.current;
      const scannerEl = scannerRef.current;
      if (!gridEl || !scannerEl) return;

      // Reduced motion: skip sweep, reveal everything immediately
      if (respectsReducedMotion()) {
        gsap.set("[data-tile-id]", { opacity: 1 });
        setRevealedTiles(new Set(ALL_TILE_IDS));
        return;
      }

      const gridHeight = gridEl.offsetHeight;
      const scanDuration = 0.9; // total sweep time in seconds
      const scanStart = 0.12;   // brief pause before sweep begins

      // Hide all tile wrappers before first paint
      gsap.set("[data-tile-id]", { opacity: 0, y: 0 });
      gsap.set(scannerEl, { y: 0, opacity: 0 });

      const tl = gsap.timeline();

      // 1. Scanner fades in at the top of the grid
      tl.to(scannerEl, { opacity: 1, duration: 0.15, ease: "none" });

      // 2. Scanner sweeps to the bottom at constant speed
      tl.to(
        scannerEl,
        { y: gridHeight, duration: scanDuration, ease: "none" },
        scanStart
      );

      // 3. Each tile reveals as the scanner beam crosses its vertical midpoint
      gridEl.querySelectorAll("[data-tile-id]").forEach((el) => {
        const htmlEl = el as HTMLElement;
        const tileId = (htmlEl.dataset.tileId ?? "") as TileId;
        const midY = htmlEl.offsetTop + htmlEl.offsetHeight / 2;
        const revealAt = scanStart + (midY / gridHeight) * scanDuration;

        tl.fromTo(
          htmlEl,
          { opacity: 0, y: 8 },
          {
            opacity: 1,
            y: 0,
            duration: 0.35,
            ease: "pitwall-accel",
            onStart() {
              // Fire per-tile child animations (counters, DrawPath, SplitReveal)
              setRevealedTiles((prev) => new Set([...prev, tileId]));
            },
          },
          revealAt
        );
      });

      // 4. Scanner beam fades out after completing the sweep
      tl.to(scannerEl, { opacity: 0, duration: 0.25 });
    },
    { scope: containerRef, dependencies: [allLoaded] }
  );

  // ── Loading state ──────────────────────────────────────────────────────────
  if (!allLoaded) {
    return (
      <div className="relative min-h-screen">
        <div className="absolute inset-0 bg-grid-lines opacity-40 pointer-events-none" />
        <div className="relative p-6 md:p-8">
          <div className="mb-6">
            <h1 className="font-heading text-2xl font-bold text-f1-text tracking-tight">
              Race Control
            </h1>
            <p className="text-f1-muted text-sm mt-0.5 font-data">{CURRENT_SEASON} Season</p>
          </div>
          <div className="flex flex-col items-center justify-center py-32 gap-3">
            <ScannerLine className="w-48" />
            <p className="font-data text-[10px] text-f1-muted tracking-widest uppercase">
              Acquiring Race Data...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Loaded — scanner reveal grid ───────────────────────────────────────────
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

        {/* Grid — relative so the scanner beam positions against it */}
        <div ref={gridRef} className="relative grid grid-cols-1 md:grid-cols-4 gap-3">

          {/* Scanner beam — sweeps from top to bottom of the grid */}
          <div
            ref={scannerRef}
            className="absolute left-0 right-0 h-px z-50 pointer-events-none col-span-full"
            style={{
              top: 0,
              background: "linear-gradient(to right, transparent 0%, var(--color-f1-cyan) 20%, var(--color-f1-cyan) 80%, transparent 100%)",
              boxShadow: "0 0 10px 2px rgba(0, 192, 255, 0.55)",
            }}
            aria-hidden="true"
          />

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
