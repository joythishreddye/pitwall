"use client";

import { useEffect, useState } from "react";
import { useMotionValue, animate } from "motion/react";
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
  // Starts at 0 — animates to value on mount, then between values on updates
  const count = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    return count.on("change", (v) => setDisplay(v.toFixed(decimals)));
  }, [count, decimals]);

  useEffect(() => {
    const controls = animate(count, value, {
      duration,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [value, duration, count]);

  return (
    <span className={cn("font-data", className)}>
      {display}
    </span>
  );
}
