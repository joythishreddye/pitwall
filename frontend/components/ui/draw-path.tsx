"use client";

import { useRef } from "react";
import { gsap, useGSAP, DrawSVGPlugin, ScrollTrigger, respectsReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

// Ensure plugins are registered (imported for side-effects)
void DrawSVGPlugin;
void ScrollTrigger;

interface DrawPathProps {
  /** SVG path data string */
  d: string;
  /** SVG viewBox (default: "0 0 200 200") */
  viewBox?: string;
  /** Stroke color (default: "var(--color-f1-cyan)") */
  color?: string;
  /** Stroke width in px (default: 1.5) */
  strokeWidth?: number;
  /** Animation duration in seconds (default: 2.5) */
  duration?: number;
  /** Delay before start in seconds (default: 0) */
  delay?: number;
  className?: string;
  /** When to trigger the draw animation */
  trigger?: "mount" | "scroll";
  /** Repeat the draw animation */
  loop?: boolean;
  onComplete?: () => void;
}

export function DrawPath({
  d,
  viewBox = "0 0 200 200",
  color = "var(--color-f1-cyan)",
  strokeWidth = 1.5,
  duration = 2.5,
  delay = 0,
  className,
  trigger = "mount",
  loop = false,
  onComplete,
}: DrawPathProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  // Store callback in a ref so the useGSAP closure always calls the latest version
  // without needing to re-create the animation when the callback identity changes.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useGSAP(
    () => {
      if (!pathRef.current) return;

      if (respectsReducedMotion()) {
        // Show path immediately without animation
        gsap.set(pathRef.current, { drawSVG: "100%" });
        return;
      }

      const animProps: gsap.TweenVars = {
        drawSVG: "100%",
        duration,
        delay,
        ease: "pitwall-accel",
        repeat: loop ? -1 : 0,
        onComplete: () => onCompleteRef.current?.(),
      };

      if (trigger === "scroll") {
        animProps.scrollTrigger = {
          trigger: svgRef.current,
          start: "top 85%",
        };
      }

      gsap.fromTo(pathRef.current, { drawSVG: "0%" }, animProps);
    },
    { scope: svgRef, dependencies: [d, duration, delay, trigger, loop] }
  );

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("overflow-visible", className)}
      aria-hidden="true"
    >
      <path
        ref={pathRef}
        d={d}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
