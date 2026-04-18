"use client";

import { useRef } from "react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";

const PRESETS = [
  {
    label: "RACE STRATEGY",
    prompt: "Explain undercut and overcut strategy in F1.",
  },
  {
    label: "DRS RULES",
    prompt: "How does DRS work and when can drivers use it?",
  },
  {
    label: "FASTEST LAP",
    prompt: "How is the fastest lap bonus point awarded?",
  },
  {
    label: "PITSTOP WINDOWS",
    prompt: "When should a driver pit in a 1-stop strategy?",
  },
  {
    label: "CHAMPIONSHIP",
    prompt: "How does the F1 championship points system work?",
  },
  {
    label: "TRACK LIMITS",
    prompt: "What are track limits and how are they enforced?",
  },
];

interface FrequencyPresetsProps {
  onSelect: (prompt: string) => void;
}

export function FrequencyPresets({ onSelect }: FrequencyPresetsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (respectsReducedMotion()) return;
      gsap.from(".freq-preset", {
        opacity: 0,
        y: 8,
        stagger: 0.06,
        duration: 0.3,
        ease: "pitwall-accel",
        delay: 0.8,
      });
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef} className="mt-8">
      <p className="font-mono text-[10px] text-f1-muted/60 tracking-[0.2em] mb-3 text-center">
        {'// FREQUENCY PRESETS'}
      </p>
      <div className="flex flex-wrap gap-2 justify-center max-w-md mx-auto">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            className="freq-preset px-3 py-1.5 bg-f1-dark border border-f1-grid font-mono text-[10px] text-f1-muted tracking-widest hover:border-f1-cyan/50 hover:text-f1-cyan/80 transition-colors cursor-pointer"
            onClick={() => onSelect(preset.prompt)}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
