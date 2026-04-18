"use client";

import { useRef } from "react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

// Resting heights for a "received" static waveform — varied so it reads as data
const RESTING_HEIGHTS = [0.3, 0.65, 0.45, 0.8, 0.5, 0.9, 0.7, 0.4];

interface WaveformIndicatorProps {
  isAnimating: boolean;
  barCount?: number;
  className?: string;
}

export function WaveformIndicator({
  isAnimating,
  barCount = 8,
  className,
}: WaveformIndicatorProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      // Set transformOrigin and resting heights on every run
      gsap.set(".wave-bar", {
        transformOrigin: "50% 100%",
        scaleY: (i: number) => RESTING_HEIGHTS[i % RESTING_HEIGHTS.length],
      });

      if (!isAnimating || respectsReducedMotion()) return;

      const tl = gsap.timeline({ repeat: -1 });
      tl.to(".wave-bar", {
        scaleY: (i: number) => 0.2 + Math.abs(Math.sin(i * 0.7)) * 0.8,
        stagger: { each: 0.07, from: "start" },
        duration: 0.5,
        ease: "sine.inOut",
        yoyo: true,
        repeat: 1,
      });
    },
    { scope: svgRef, dependencies: [isAnimating] }
  );

  // 2.5px bar + 1.5px gap between each bar
  const viewBoxWidth = barCount * 4 - 1;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${viewBoxWidth} 16`}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {Array.from({ length: barCount }).map((_, i) => (
        <rect
          key={i}
          className="wave-bar"
          x={i * 4}
          y={0}
          width={2.5}
          height={16}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
