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
  const [display, setDisplay] = useState(value.toFixed(decimals));
  const obj = useRef({ val: value });

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
