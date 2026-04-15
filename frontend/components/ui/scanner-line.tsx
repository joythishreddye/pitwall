"use client";

import { useRef, useEffect } from "react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

interface ScannerLineProps {
  className?: string;
  /** Pause the scan animation */
  paused?: boolean;
  /** Speed multiplier (1 = normal, 2 = twice as fast) */
  speed?: number;
}

export function ScannerLine({
  className,
  paused = false,
  speed = 1,
}: ScannerLineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      if (!lineRef.current) return;

      const shouldPause = paused || respectsReducedMotion();
      const tl = gsap.timeline({ repeat: -1, paused: shouldPause });
      tl.fromTo(
        lineRef.current,
        { xPercent: -100 },
        { xPercent: 400, duration: 1.8 / speed, ease: "none" }
      );

      tlRef.current = tl;
    },
    { scope: containerRef, dependencies: [speed] }
  );

  // Respond to pause/resume without recreating the timeline
  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) return;
    if (paused) {
      tl.pause();
    } else {
      tl.resume();
    }
  }, [paused]);

  return (
    <div
      ref={containerRef}
      className={cn("relative h-px w-full overflow-hidden", className)}
    >
      <div
        ref={lineRef}
        className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-f1-cyan/80 to-transparent"
      />
    </div>
  );
}
