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

  // After draw completes: ScrollTrigger scrub cross-fades hero → inline as user scrolls.
  // Scrub reverses on scroll-up, so the hero reappears if the user scrolls back to the top.
  useGSAP(
    () => {
      if (!drawComplete || !heroRef.current || !inlineRef.current) return;

      if (respectsReducedMotion()) {
        gsap.set(heroRef.current, { opacity: 0 });
        gsap.set(inlineRef.current, { opacity: 1 });
        return;
      }

      const tl = gsap.timeline({ defaults: { ease: "none" } });
      // Hero fades out and scales down slightly — sense of "compressing" into the title row
      tl.to(heroRef.current, { opacity: 0, scale: 0.72, transformOrigin: "top center" }, 0);
      // Inline fades in during the second half of the scroll range
      tl.fromTo(
        inlineRef.current,
        { opacity: 0, scale: 0.85 },
        { opacity: 1, scale: 1 },
        0.4 // starts at 40% progress
      );

      ScrollTrigger.create({
        trigger: pageRef.current,
        start: "top top",
        end: "+=280",
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
      <div className="p-8">
        <div className="h-6 w-48 bg-f1-grid/30 rounded-sm animate-pulse mb-4" />
        <div className="h-52 max-w-2xl mx-auto bg-f1-grid/10 animate-pulse mb-6" />
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
    <div className="p-8" ref={pageRef}>
      {/* Back button — restores previous season via browser history */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-f1-muted text-sm hover:text-f1-text transition-colors duration-150 mb-6 cursor-pointer"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Races
      </button>

      {/* Hero circuit — height-constrained so content is immediately accessible.
          The SVG viewBox is square (500×500) so without a height cap it would
          render at full width × full width height, blocking the entire viewport. */}
      {circuitPath && (
        <div
          ref={heroRef}
          className="flex justify-center mb-6 max-h-56 overflow-hidden"
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
            className="h-full w-auto max-w-2xl opacity-[0.22]"
          />
        </div>
      )}

      {/* Title row — inline circuit docks here as user scrolls */}
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

        {/* Inline circuit — starts invisible, ScrollTrigger fades it in */}
        {circuitPath && (
          <div
            ref={inlineRef}
            className="shrink-0 w-28 h-20"
            style={{ opacity: 0 }}
            aria-hidden="true"
          >
            <svg
              viewBox={circuitPath.viewBox}
              className="w-full h-full"
            >
              {/* Outlined double-stroke (matches hero style) */}
              <path
                d={circuitPath.d}
                fill="none"
                stroke="var(--color-f1-cyan)"
                strokeWidth={10}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.28}
              />
              <path
                d={circuitPath.d}
                fill="none"
                stroke="#0F0F0F"
                strokeWidth={4.5}
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
