"use client";

import { useRef, useMemo, useState } from "react";
import { gsap, useGSAP, Flip, ScrollTrigger, respectsReducedMotion } from "@/lib/gsap";
import { DriverCard } from "./driver-card";
import { FilterBar, type FilterState } from "./filter-bar";
import type { DriverStanding } from "@/lib/schemas/standings";
import type { OpenF1Driver } from "@/lib/hooks/use-driver-photos";

// Ensure plugin side-effects
void Flip;
void ScrollTrigger;

interface DriverGridProps {
  drivers: DriverStanding[];
  photoDrivers: OpenF1Driver[] | undefined;
}

function sortDrivers(drivers: DriverStanding[], sort: FilterState["sort"]): DriverStanding[] {
  return [...drivers].sort((a, b) => {
    if (sort === "points") return b.points - a.points;
    if (sort === "wins") return b.wins - a.wins;
    return a.surname.localeCompare(b.surname);
  });
}

export function DriverGrid({ drivers, photoDrivers }: DriverGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasEnteredRef = useRef(false);

  // Capture Flip state before React re-renders via this ref
  const flipStateRef = useRef<ReturnType<typeof Flip.getState> | null>(null);

  const [filter, setFilter] = useState<FilterState>({
    team: "",
    nationality: "",
    sort: "points",
  });

  // Derive unique teams + nationalities from full driver list
  const teams = useMemo(
    () =>
      [...new Set(drivers.map((d) => d.constructor_name).filter(Boolean) as string[])].sort(),
    [drivers]
  );
  const nationalities = useMemo(
    () =>
      [...new Set(drivers.map((d) => d.nationality).filter(Boolean) as string[])].sort(),
    [drivers]
  );

  // Filtered + sorted drivers
  const visible = useMemo(() => {
    let result = drivers;
    if (filter.team) result = result.filter((d) => d.constructor_name === filter.team);
    if (filter.nationality) result = result.filter((d) => d.nationality === filter.nationality);
    return sortDrivers(result, filter.sort);
  }, [drivers, filter]);

  const applyFilter = (next: FilterState) => {
    if (containerRef.current && !respectsReducedMotion()) {
      // Capture positions before React re-renders
      flipStateRef.current = Flip.getState(".driver-card", { props: "opacity" });
    }
    setFilter(next);
  };

  // After React commits the new filter, run Flip OR initial stagger
  useGSAP(
    () => {
      if (!containerRef.current) return;

      // Initial entrance — runs once
      if (!hasEnteredRef.current) {
        hasEnteredRef.current = true;
        if (!respectsReducedMotion()) {
          gsap.from(".driver-card", {
            opacity: 0,
            y: 16,
            stagger: 0.04,
            duration: 0.35,
            ease: "pitwall-accel",
            scrollTrigger: {
              trigger: ".drivers-grid",
              start: "top 85%",
            },
          });
        }
        return;
      }

      // Subsequent filter/sort changes — run Flip
      if (flipStateRef.current && !respectsReducedMotion()) {
        Flip.from(flipStateRef.current, {
          duration: 0.4,
          ease: "pitwall-accel",
          stagger: 0.02,
          fade: true,
          absolute: true,
        });
        flipStateRef.current = null;
      }
    },
    { scope: containerRef, dependencies: [filter] }
  );

  return (
    <div ref={containerRef}>
      <FilterBar
        filter={filter}
        teams={teams}
        nationalities={nationalities}
        onChange={applyFilter}
      />

      <div className="drivers-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visible.map((driver) => (
          <DriverCard
            key={driver.driver_ref}
            driver={driver}
            photoDrivers={photoDrivers}
          />
        ))}
        {visible.length === 0 && (
          <p className="text-f1-muted text-sm col-span-full py-8 text-center font-mono">
            NO DRIVERS MATCH FILTER
          </p>
        )}
      </div>
    </div>
  );
}
