"use client";

import React, { useRef } from "react";
import { gsap, useGSAP, SplitText, respectsReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

// Ensure plugin is registered (imported for side-effects)
void SplitText;

interface SplitRevealProps {
  text: string;
  /** How to split the text (default: "chars") */
  type?: "chars" | "words" | "lines";
  /** Seconds between each unit (default: 0.025) */
  stagger?: number;
  /** Seconds before animation starts (default: 0) */
  delay?: number;
  /** Duration per unit in seconds (default: 0.3) */
  duration?: number;
  className?: string;
  /** Wrapper element tag (default: "span") */
  tag?: "h1" | "h2" | "h3" | "p" | "span";
  /**
   * When true the text stays hidden and does not reveal.
   * Flip to false to trigger the reveal (e.g. after a tile reveal).
   */
  paused?: boolean;
}

export function SplitReveal({
  text,
  type = "chars",
  stagger = 0.025,
  delay = 0,
  duration = 0.3,
  className,
  tag: Tag = "span",
  paused = false,
}: SplitRevealProps) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!ref.current) return;

      // Don't reveal until the tile is shown
      if (paused) return;

      if (respectsReducedMotion()) {
        return;
      }

      const split = new SplitText(ref.current, { type });
      const units =
        type === "chars"
          ? split.chars
          : type === "words"
            ? split.words
            : split.lines;

      gsap.from(units, {
        opacity: 0,
        y: 12,
        stagger,
        duration,
        delay,
        ease: "pitwall-accel",
      });

      return () => split.revert();
    },
    { scope: ref, dependencies: [text, type, stagger, delay, duration, paused] }
  );

  return (
    <Tag
      ref={ref as React.RefObject<HTMLHeadingElement & HTMLParagraphElement & HTMLSpanElement>}
      className={cn(className)}
      style={paused ? { opacity: 0 } : undefined}
    >
      {text}
    </Tag>
  );
}
