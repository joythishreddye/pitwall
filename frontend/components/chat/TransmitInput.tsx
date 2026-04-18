"use client";

import { useRef } from "react";
import { Square } from "lucide-react";
import { gsap, useGSAP } from "@/lib/gsap";
import { StatusDot } from "@/components/ui/status-dot";

interface TransmitInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop: () => void;
  isLoading: boolean;
}

export function TransmitInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading,
}: TransmitInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pressTlRef = useRef<gsap.core.Timeline | null>(null);

  // Pre-build the press micro-animation — rebuilt each time isLoading changes
  // because the button conditionally unmounts/remounts
  useGSAP(
    () => {
      if (isLoading || !buttonRef.current) return;
      pressTlRef.current = gsap
        .timeline({ paused: true })
        .to(buttonRef.current, { scale: 0.97, duration: 0.08, ease: "none" })
        .to(buttonRef.current, { scale: 1.0, duration: 0.08, ease: "none" });
    },
    { scope: containerRef, dependencies: [isLoading] }
  );

  const handleMouseDown = () => pressTlRef.current?.restart();

  return (
    <form onSubmit={onSubmit} className="shrink-0">
      <div
        ref={containerRef}
        className="flex items-stretch h-12 border-t border-f1-grid bg-f1-dark"
      >
        {/* Channel status */}
        <div className="flex items-center gap-2 px-4 border-r border-f1-grid shrink-0">
          <StatusDot
            variant={isLoading ? "caution" : "live"}
            pulse={!isLoading}
          />
          <span className="hidden sm:inline font-mono text-[10px] text-f1-muted tracking-[0.15em] whitespace-nowrap select-none">
            {isLoading ? "RECEIVING" : "OPEN CHANNEL"}
          </span>
        </div>

        {/* Input */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ASK YOUR RACE ENGINEER..."
          className="flex-1 bg-transparent outline-none px-4 font-mono text-sm text-f1-text placeholder:text-f1-muted/50 disabled:opacity-60 focus:ring-0 focus:border-none"
          disabled={isLoading}
          autoComplete="off"
          spellCheck={false}
        />

        {/* Action button */}
        {isLoading ? (
          <button
            type="button"
            onClick={onStop}
            className="flex items-center gap-2 px-5 border-l border-f1-grid font-mono text-[10px] tracking-[0.15em] text-f1-muted hover:text-f1-red hover:bg-f1-red/5 transition-colors shrink-0 cursor-pointer"
          >
            <Square className="h-3 w-3 shrink-0" />
            <span className="hidden sm:inline">ABORT</span>
          </button>
        ) : (
          <button
            ref={buttonRef}
            type="submit"
            disabled={!value.trim()}
            onMouseDown={handleMouseDown}
            className="flex items-center gap-2 px-5 border-l border-f1-grid font-mono text-[10px] tracking-[0.15em] text-f1-red hover:bg-f1-red/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0 cursor-pointer"
          >
            TRANSMIT
          </button>
        )}
      </div>
    </form>
  );
}
