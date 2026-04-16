"use client";

import { useRef, useState } from "react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

interface NumberCounterProps {
  value: number;
  /** Number of decimal places */
  decimals?: number;
  /** Duration of animation in seconds */
  duration?: number;
  className?: string;
  /**
   * When true the counter stays at 0 and does not animate.
   * Flip to false to fire the count-up (e.g. after a tile reveal).
   */
  paused?: boolean;
}

export function NumberCounter({
  value,
  decimals = 0,
  duration = 0.8,
  className,
  paused = false,
}: NumberCounterProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  // Start from 0 so the counter always counts up to the value on mount.
  // The ref persists the current position between renders, so live updates
  // count from the last animated value (not from 0 again).
  const [display, setDisplay] = useState(() => (0).toFixed(decimals));
  const obj = useRef({ val: 0 });

  useGSAP(
    () => {
      // Don't animate until the tile containing this counter is revealed
      if (paused) return;

      if (respectsReducedMotion()) {
        setDisplay(value.toFixed(decimals));
        obj.current.val = value;
        return;
      }

      gsap.to(obj.current, {
        val: value,
        duration,
        ease: "pitwall-accel",
        onUpdate() {
          setDisplay(obj.current.val.toFixed(decimals));
        },
      });
    },
    { scope: containerRef, dependencies: [value, decimals, duration, paused] }
  );

  return (
    <span ref={containerRef} className={cn("font-data", className)}>
      {display}
    </span>
  );
}
