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
}

export function NumberCounter({
  value,
  decimals = 0,
  duration = 0.8,
  className,
}: NumberCounterProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  // Start from 0 so the counter always counts up to the value on mount.
  // The ref persists the current position between renders, so live updates
  // count from the last animated value (not from 0 again).
  const [display, setDisplay] = useState(() => (0).toFixed(decimals));
  const obj = useRef({ val: 0 });

  useGSAP(
    () => {
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
    { scope: containerRef, dependencies: [value, decimals, duration] }
  );

  return (
    <span ref={containerRef} className={cn("font-data", className)}>
      {display}
    </span>
  );
}
