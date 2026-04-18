"use client";

import { use, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { gsap, useGSAP, ScrollTrigger, respectsReducedMotion } from "@/lib/gsap";
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
  const [drawComplete, setDrawComplete] = useState(false);

  const heroRef = useRef<HTMLDivElement>(null);
  const inlineRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  const { data: race, isLoading, error } = useRaceDetail(raceId);
  const { data: strategy } = useRaceStrategy(raceId);

  // ScrollTrigger runs over the full hero height (top-top → bottom-top).
  // As user scrolls the hero out of view the circuit fades; inline fades in.
  // Scrub reverses on scroll-up so the circuit reappears.
  useGSAP(
    () => {
      if (!drawComplete || !heroRef.current || !inlineRef.current) return;

      if (respectsReducedMotion()) {
        gsap.set(heroRef.current, { opacity: 0 });
        gsap.set(inlineRef.current, { opacity: 1 });
        return;
      }

      const tl = gsap.timeline({ defaults: { ease: "none" } });
      tl.to(heroRef.current, { opacity: 0, scale: 0.95, transformOrigin: "top center" }, 0);
      tl.fromTo(
        inlineRef.current,
        { opacity: 0, scale: 0.9 },
        { opacity: 1, scale: 1 },
        0.55
      );

      ScrollTrigger.create({
        trigger: heroRef.current,
        start: "top top",
        end: "bottom top",
        scrub: 1.2,
        animation: tl,
      });

      ScrollTrigger.refresh();
    },
    { scope: pageRef, dependencies: [drawComplete] }
  );

  const handleDrawComplete = useCallback(() => {
    setDrawComplete(true);
  }, []);

  if (isLoading) {
    return (
      <div className="relative">
        <div className="h-screen flex items-center justify-center bg-f1-dark">
          <div className="w-72 h-72 bg-f1-grid/10 animate-pulse" />
        </div>
        <div className="px-8 pb-8 pt-6">
          <div className="h-8 w-80 bg-f1-grid/30 rounded-sm animate-pulse mb-2" />
          <div className="h-4 w-60 bg-f1-grid/30 rounded-sm animate-pulse" />
        </div>
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
    <div ref={pageRef} className="relative">
      {/* Back button — absolute on top of hero, always visible */}
      <button
        onClick={() => router.back()}
        className="absolute top-8 left-8 z-20 inline-flex items-center gap-1.5 text-f1-muted text-sm hover:text-f1-text transition-colors duration-150 cursor-pointer"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Races
      </button>

      {/* Full-viewport hero circuit — scrolled past to reach content */}
      {circuitPath && (
        <div
          ref={heroRef}
          className="h-[calc(100vh-40px)] flex items-center justify-center px-8 overflow-hidden"
        >
          <DrawPath
            d={circuitPath.d}
            viewBox={circuitPath.viewBox}
            color="var(--color-f1-cyan)"
            strokeWidth={2}
            outlined
            duration={3.5}
            trigger="mount"
            onComplete={handleDrawComplete}
            className="w-full h-full max-w-4xl max-h-full opacity-[0.28]"
          />
        </div>
      )}

      {/* Content section — starts below the hero */}
      <div className="px-8 pb-8">
        {/* Flex row: left col (flex-1) = title + meta strip stacked.
            Right col = circuit. items-stretch gives circuit definite height
            = left col height; aspect-ratio:1 resolves width from that height.
            No gap hacks, no mt-auto, no grid circular dependency. */}
        <div className="mb-6 pt-6 border-t border-f1-grid flex items-stretch gap-8">

          {/* Left: title row + meta strip, stacked with gap-4 */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{race.name}</h1>
              <div className="flex items-center gap-4 mt-1 text-sm text-f1-muted flex-wrap">
                <span>{race.circuit.name}</span>
                <span className="text-f1-grid" aria-hidden="true">|</span>
                <span className="font-data">{race.date}</span>
                <span className="text-f1-grid" aria-hidden="true">|</span>
                <span>Round {race.round}</span>
              </div>
            </div>

            {circuitMeta && (
              <div className="flex items-center gap-6 px-4 py-3 border border-f1-grid bg-f1-dark-2 rounded-sm text-sm flex-wrap">
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
          </div>

          {/* Right: circuit — height = left col height (via stretch).
              aspect-ratio:1 makes width = height. shrink-0 prevents compression. */}
          {circuitPath && (
            <div
              ref={inlineRef}
              className="shrink-0 w-36 h-36"
              style={{ opacity: 0, aspectRatio: '1 / 1' }}
              aria-hidden="true"
            >
              <svg viewBox={circuitPath.viewBox} className="w-full h-full">
                <path
                  d={circuitPath.d}
                  fill="none"
                  stroke="var(--color-f1-cyan)"
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.65}
                />
              </svg>
            </div>
          )}
        </div>

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
    </div>
  );
}
