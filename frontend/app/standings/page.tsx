"use client";

import { useRef, useState } from "react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import { CURRENT_SEASON } from "@/lib/constants/season";
import { useStandings, useStandingsProgression } from "@/lib/hooks/use-standings";
import { useRaceCalendar } from "@/lib/hooks/use-races";
import { ErrorState } from "@/components/error-state";
import { SeasonSelector } from "@/components/season-selector";
import { DriversTable, ConstructorsTable } from "@/components/standings";
import { ChampionshipChart } from "@/components/championship-chart";
import { ScannerLine } from "@/components/ui/scanner-line";
import { TrendingUp } from "lucide-react";

type Tab = "drivers" | "constructors";
const TABS: Tab[] = ["drivers", "constructors"];

export default function StandingsPage() {
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [activeTab, setActiveTab] = useState<Tab>("drivers");

  const { data, isLoading, error, refetch } = useStandings(season);
  const { data: progressions = [] } = useStandingsProgression(season);
  const { data: races = [] } = useRaceCalendar(season);

  // Build round → country label map from race calendar
  const roundLabels = Object.fromEntries(
    races.map((r) => [r.round, r.circuit.country ?? `R${r.round}`])
  ) as Record<number, string>;

  const drivers = data?.driver_standings ?? [];
  const constructors = data?.constructor_standings ?? [];
  const maxPoints =
    activeTab === "drivers"
      ? (drivers[0]?.points ?? 0)
      : (constructors[0]?.points ?? 0);

  // -------------------------------------------------------------------------
  // Tab bar — sliding active indicator + content fade
  // -------------------------------------------------------------------------
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Initialise indicator under the active tab on first render
  useGSAP(
    () => {
      const btn = tabRefs.current[TABS.indexOf(activeTab)];
      const indicator = indicatorRef.current;
      if (!btn || !indicator || !tabBarRef.current) return;
      const btnRect = btn.getBoundingClientRect();
      const barRect = tabBarRef.current.getBoundingClientRect();
      gsap.set(indicator, {
        x: btnRect.left - barRect.left,
        width: btnRect.width,
      });
    },
    // Run once on mount (empty dependencies)
    { scope: tabBarRef, dependencies: [] }
  );

  // Slide indicator to the newly active tab
  useGSAP(
    () => {
      const btn = tabRefs.current[TABS.indexOf(activeTab)];
      const indicator = indicatorRef.current;
      if (!btn || !indicator || !tabBarRef.current) return;
      const btnRect = btn.getBoundingClientRect();
      const barRect = tabBarRef.current.getBoundingClientRect();
      if (respectsReducedMotion()) {
        gsap.set(indicator, {
          x: btnRect.left - barRect.left,
          width: btnRect.width,
        });
        return;
      }
      gsap.to(indicator, {
        x: btnRect.left - barRect.left,
        width: btnRect.width,
        duration: 0.25,
        ease: "pitwall-accel",
      });
    },
    { scope: tabBarRef, dependencies: [activeTab] }
  );

  // Fade in content each time the active tab changes
  useGSAP(
    () => {
      if (!contentRef.current) return;
      if (respectsReducedMotion()) return;
      gsap.fromTo(
        contentRef.current,
        { opacity: 0, y: -4 },
        { opacity: 1, y: 0, duration: 0.2, ease: "pitwall-accel" }
      );
    },
    { dependencies: [activeTab] }
  );

  return (
    <div className="p-8 max-w-screen-xl">
      {/* ---- Header ---- */}
      <div className="mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight">
            Championship Standings
          </h1>
          <SeasonSelector value={season} onChange={setSeason} />
        </div>
        <p className="text-f1-muted text-sm mt-1 font-data tabular-nums">
          {data ? `Round ${data.round} · ${season} season` : "Loading..."}
        </p>
      </div>

      {/* ---- Tab bar ---- */}
      <div
        ref={tabBarRef}
        role="tablist"
        className="relative flex gap-0 mb-0 border-b border-f1-grid"
      >
        {TABS.map((tab, i) => (
          <button
            key={tab}
            ref={(el) => { tabRefs.current[i] = el; }}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize transition-colors duration-150 cursor-pointer",
              activeTab === tab ? "text-f1-text" : "text-f1-muted hover:text-f1-text"
            )}
          >
            {tab}
          </button>
        ))}
        {/* Sliding indicator — 2px bar anchored to bottom of tab bar */}
        <div
          ref={indicatorRef}
          className="absolute bottom-0 left-0 h-[2px] bg-f1-red"
          aria-hidden="true"
        />
      </div>

      {/* ---- Table content ---- */}
      <div ref={contentRef}>
        {isLoading ? (
          <LoadingSkeleton rows={activeTab === "drivers" ? 20 : 10} />
        ) : error ? (
          <ErrorState message="Failed to load standings data" onRetry={refetch} />
        ) : activeTab === "drivers" ? (
          <DriversTable drivers={drivers} maxPoints={maxPoints} />
        ) : (
          <ConstructorsTable constructors={constructors} maxPoints={maxPoints} />
        )}
      </div>

      {/* ---- Championship Progression Chart — full-width breakout ---- */}
      <section className="mt-10 -mx-8">
        <div className="flex items-center gap-2 mb-4 px-8">
          <TrendingUp className="h-4 w-4 text-f1-muted" aria-hidden="true" />
          <h2 className="text-sm text-f1-muted uppercase tracking-widest">
            Championship Progression
          </h2>
        </div>

        <div className="bg-f1-dark-2 border-y border-f1-grid px-8 py-5 relative">
          {!progressions.length && (
            <div className="absolute inset-x-0 top-0">
              <ScannerLine />
            </div>
          )}
          <ChampionshipChart
            progressions={progressions}
            roundLabels={roundLabels}
            mode={activeTab === "constructors" ? "constructors" : "drivers"}
          />
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <div className="w-full space-y-0">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-11 border-b border-f1-grid/50 border-l-4 border-l-transparent pl-3 pr-4 flex items-center",
            i % 2 === 0 ? "bg-f1-dark-2" : "bg-f1-dark-3"
          )}
        >
          <div className="h-2.5 w-full bg-f1-grid/30 animate-pulse" />
        </div>
      ))}
    </div>
  );
}
