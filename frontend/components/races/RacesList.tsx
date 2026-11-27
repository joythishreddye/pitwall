"use client";

import { useRef } from "react";
import { gsap, useGSAP, ScrollTrigger, respectsReducedMotion } from "@/lib/gsap";
import { raceStart } from "@/lib/hooks/use-countdown";
import { RaceCard } from "./RaceCard";
import type { RaceCalendarItem } from "@/lib/schemas/races";

interface RacesListProps {
  races: RaceCalendarItem[];
}

export function RacesList({ races }: RacesListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const now = new Date();

  // Next until its lights go out, as on the homepage (not midnight of its day in the reader's zone)
  const nextRaceIndex = races.findIndex((race) => {
    if (!race.date) return false;
    return raceStart(race.date, race.time) >= now.getTime();
  });

  useGSAP(
    () => {
      if (respectsReducedMotion()) return;

      gsap.from(".race-card", {
        opacity: 0,
        y: 20,
        stagger: 0.06,
        duration: 0.4,
        ease: "pitwall-accel",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 90%",
          once: true,
        },
      });

      ScrollTrigger.refresh();
    },
    { scope: containerRef, dependencies: [races] }
  );

  return (
    <div
      ref={containerRef}
      className="grid grid-cols-1 md:grid-cols-2 gap-4"
    >
      {races.map((race, index) => (
        <RaceCard
          key={race.id}
          race={race}
          isNext={index === nextRaceIndex}
          index={index}
        />
      ))}
    </div>
  );
}
