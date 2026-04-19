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
  /**
   * Cased-lines / "outlined track" mode.
   * Renders two stacked paths: a wide outer stroke (colored) and a narrower
   * inner stroke (#0F0F0F) that punches a dark channel through the middle,
   * producing a road-edge appearance at any opacity.
   */
  outlined?: boolean;
  /** Animation duration in seconds (default: 2.5) */
  duration?: number;
  /**
   * When true the circuit is hidden and the draw animation does not start.
   * Flip to false to trigger the drawing (e.g. after a tile reveal).
   */
  paused?: boolean;
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
  outlined = false,
  duration = 2.5,
  delay = 0,
  className,
  trigger = "mount",
  loop = false,
  onComplete,
  paused = false,
}: DrawPathProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // Single-stroke mode
  const pathRef = useRef<SVGPathElement>(null);
  // Outlined / cased-lines mode
  const outerPathRef = useRef<SVGPathElement>(null);
  const innerPathRef = useRef<SVGPathElement>(null);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useGSAP(
    () => {
      // Collect whichever path refs are active
      const targets = (
        outlined
          ? [outerPathRef.current, innerPathRef.current]
          : [pathRef.current]
      ).filter((el): el is SVGPathElement => el !== null);

      if (targets.length === 0) return;

      // Keep circuit hidden until the tile is revealed
      if (paused) {
        gsap.set(targets, { drawSVG: "0%" });
        return;
      }

      if (respectsReducedMotion()) {
        gsap.set(targets, { drawSVG: "100%" });
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

      gsap.fromTo(targets, { drawSVG: "0%" }, animProps);
    },
    { scope: svgRef, dependencies: [d, duration, delay, trigger, loop, outlined, paused] }
  );

  // Outer stroke is 2.5× the base width; inner (dark) is 1.2× — the gap
  // between them creates visible road edges on each side of the center line.
  const outerWidth = strokeWidth * 2.5;
  const innerWidth = strokeWidth * 1.2;

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("overflow-visible", className)}
      style={paused ? { opacity: 0 } : undefined}
      aria-hidden="true"
    >
      {outlined ? (
        <>
          {/* Outer / border stroke — colored, wider */}
          <path
            ref={outerPathRef}
            d={d}
            stroke={color}
            strokeWidth={outerWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Inner / road stroke — dark, punches a channel through the center */}
          <path
            ref={innerPathRef}
            d={d}
            stroke="var(--color-f1-dark)"
            strokeWidth={innerWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      ) : (
        <path
          ref={pathRef}
          d={d}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
    </svg>
  );
}
