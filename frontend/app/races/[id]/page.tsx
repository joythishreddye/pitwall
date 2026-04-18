"use client";

import { use, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { useRaceDetail, useRaceStrategy } from "@/lib/hooks/use-races";
import { getCircuitMeta, circuitPaths } from "@/lib/constants/circuits";
import { DrawPath } from "@/components/ui/draw-path";
import { RaceResultsTable } from "@/components/races/RaceResultsTable";
import { PitStopsTable } from "@/components/races/PitStopsTable";

type Tab = "results" | "pitstops";

export default function RaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const raceId = Number(id);
  const [activeTab, setActiveTab] = useState<Tab>("results");
  const [drawDocked, setDrawDocked] = useState(false);

  const heroRef = useRef<HTMLDivElement>(null);
  const inlineCircuitRef = useRef<HTMLDivElement>(null);

  const { data: race, isLoading, error } = useRaceDetail(raceId);
  const { data: strategy } = useRaceStrategy(raceId);

  // Fade in the inline circuit after the hero draw completes
  useGSAP(
    () => {
      if (!drawDocked || !inlineCircuitRef.current) return;
      gsap.fromTo(
        inlineCircuitRef.current,
        { opacity: 0, scale: 0.85 },
        { opacity: 1, scale: 1, duration: 0.45, ease: "pitwall-accel" }
      );
    },
    { dependencies: [drawDocked] }
  );

  const handleDrawComplete = useCallback(() => {
    if (respectsReducedMotion()) {
      setDrawDocked(true);
      return;
    }
    if (!heroRef.current) return;
    gsap.to(heroRef.current, {
      opacity: 0,
      duration: 0.5,
      ease: "pitwall-brake",
      onComplete: () => setDrawDocked(true),
    });
  }, []);

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="h-6 w-48 bg-f1-grid/30 rounded-sm animate-pulse mb-4" />
        <div className="h-64 max-w-2xl mx-auto bg-f1-grid/10 animate-pulse mb-8" />
        <div className="h-8 w-80 bg-f1-grid/30 rounded-sm animate-pulse mb-2" />
        <div className="h-4 w-60 bg-f1-grid/30 rounded-sm animate-pulse" />
      </div>
    );
  }

  if (error || !race) {
    return (
      <div className="p-8">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-f1-muted text-sm hover:text-f1-text transition-colors duration-150 mb-6 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Races
        </button>
        <p className="text-f1-muted">Race not found.</p>
      </div>
    );
  }

  const winnerMs = race.results[0]?.time_millis ?? null;
  const circuitMeta = getCircuitMeta(race.circuit.name);
  const circuitPath = circuitMeta ? circuitPaths[circuitMeta.key] : null;

  return (
    <div className="p-8">
      {/* Back button — uses browser history to restore the correct season */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-f1-muted text-sm hover:text-f1-text transition-colors duration-150 mb-8 cursor-pointer"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Races
      </button>

      {/* Phase 1: large hero circuit — visible until draw completes */}
      {!drawDocked && circuitPath && (
        <div ref={heroRef} className="flex justify-center mb-8">
          <DrawPath
            d={circuitPath.d}
            viewBox={circuitPath.viewBox}
            color="var(--color-f1-cyan)"
            strokeWidth={2}
            duration={3.5}
            trigger="mount"
            onComplete={handleDrawComplete}
            className="w-full max-w-2xl opacity-[0.22]"
          />
        </div>
      )}

      {/* Race title row — inline circuit docks here after draw */}
      <div className="mb-6 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{race.name}</h1>
          <div className="flex items-center gap-4 mt-1 text-sm text-f1-muted flex-wrap">
            <span>{race.circuit.name}</span>
            <span className="text-f1-grid" aria-hidden="true">|</span>
            <span className="font-data">{race.date}</span>
            <span className="text-f1-grid" aria-hidden="true">|</span>
            <span>Round {race.round}</span>
          </div>
        </div>

        {/* Phase 2: inline circuit — fades in after hero draw */}
        {drawDocked && circuitPath && (
          <div
            ref={inlineCircuitRef}
            className="shrink-0 w-28 h-20"
            aria-hidden="true"
            style={{ opacity: 0 }} // starts hidden; GSAP fades in
          >
            <svg
              viewBox={circuitPath.viewBox}
              className="w-full h-full opacity-30"
            >
              <path
                d={circuitPath.d}
                fill="none"
                stroke="var(--color-f1-cyan)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Circuit metadata strip */}
      {circuitMeta && (
        <div className="flex items-center gap-6 mb-6 px-4 py-3 border border-f1-grid bg-f1-dark-2 rounded-sm text-sm flex-wrap">
          <div>
            <span className="text-[10px] text-f1-muted uppercase tracking-wider block">Length</span>
            <p className="font-data font-semibold">{circuitMeta.lengthKm} km</p>
          </div>
          <div>
            <span className="text-[10px] text-f1-muted uppercase tracking-wider block">Turns</span>
            <p className="font-data font-semibold">{circuitMeta.turns}</p>
          </div>
          <div>
            <span className="text-[10px] text-f1-muted uppercase tracking-wider block">DRS Zones</span>
            <p className="font-data font-semibold">{circuitMeta.drsZones}</p>
          </div>
          {circuitMeta.lapRecord && (
            <div>
              <span className="text-[10px] text-f1-muted uppercase tracking-wider block">Lap Record</span>
              <p className="font-data font-semibold">
                {circuitMeta.lapRecord.time}
                <span className="text-f1-muted font-normal ml-1.5">
                  {circuitMeta.lapRecord.driver} ({circuitMeta.lapRecord.year})
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" className="flex gap-0 mb-6 border-b border-f1-grid">
        {(["results", "pitstops"] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize transition-colors duration-150 cursor-pointer",
              activeTab === tab
                ? "text-f1-text border-b-2 border-f1-red"
                : "text-f1-muted hover:text-f1-text"
            )}
          >
            {tab === "pitstops" ? "Pit Stops" : "Results"}
          </button>
        ))}
      </div>

      {activeTab === "results" ? (
        <RaceResultsTable results={race.results} winnerMs={winnerMs} />
      ) : (
        <PitStopsTable strategy={strategy ?? []} />
      )}
    </div>
  );
}
