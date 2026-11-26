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
   * When true the counter stays at 0. Flip to false to show the value
   * (e.g. after a tile reveal); only later value changes animate.
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
  // The first value shows at once: text must be settled when it appears, so
  // nothing counts up on load (DESIGN.md, Motion). Later changes animate from
  // the last value, which the ref keeps between renders.
  const [display, setDisplay] = useState(() => (paused ? 0 : value).toFixed(decimals));
  const obj = useRef({ val: paused ? 0 : value });
  const shown = useRef(!paused);

  useGSAP(
    () => {
      // Stay at 0 until the tile containing this counter is revealed
      if (paused) return;

      if (!shown.current || respectsReducedMotion()) {
        shown.current = true;
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
