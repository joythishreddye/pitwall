"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { gsap, useGSAP, respectsReducedMotion } from "@/lib/gsap";
import { DrawPath } from "@/components/ui/draw-path";
import { SplitReveal } from "@/components/ui/split-reveal";
import { circuitPaths } from "@/lib/constants/circuits";

export default function NotFound() {
  const containerRef = useRef<HTMLDivElement>(null);

  // GSAP master timeline — subtitle, error code, CTA enter after DNF reveal
  useGSAP(
    () => {
      if (respectsReducedMotion()) return;

      // Set initial hidden/offset state, then gsap.to animates to final
      gsap.set(".error-subtitle", { opacity: 0, y: 8 });
      gsap.set(".error-code", { opacity: 0 });
      gsap.set(".error-cta", { opacity: 0, x: -8 });

      const tl = gsap.timeline({ delay: 1.2 });
      tl.to(".error-subtitle", { opacity: 1, y: 0, duration: 0.3, ease: "pitwall-accel" })
        .to(".error-code", { opacity: 1, duration: 0.2 }, "-=0.1")
        .to(".error-cta", { opacity: 1, x: 0, duration: 0.25, ease: "pitwall-accel" }, "-=0.05");
    },
    { scope: containerRef }
  );

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-start justify-center min-h-[60vh] p-8 relative overflow-hidden"
    >
      {/* Suzuka circuit — draws itself over 4s as ambient background */}
      <DrawPath
        d={circuitPaths.suzuka.d}
        viewBox={circuitPaths.suzuka.viewBox}
        color="var(--color-f1-cyan)"
        duration={4}
        delay={0}
        loop={false}
        className="absolute inset-0 w-full h-full opacity-[0.18] pointer-events-none"
      />

      {/* Background grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        aria-hidden="true"
        style={{
          backgroundImage: `
            linear-gradient(to right, #E5E5E5 1px, transparent 1px),
            linear-gradient(to bottom, #E5E5E5 1px, transparent 1px)
          `,
          backgroundSize: "32px 32px",
        }}
      />

      {/* DNF — SplitReveal char by char, large display text */}
      <SplitReveal
        text="DNF"
        type="chars"
        stagger={0.1}
        delay={0.5}
        tag="h1"
        className="font-heading text-[20vw] font-black text-f1-text leading-none relative z-10 mb-4"
      />

      {/* PAGE NOT FOUND subtitle */}
      <p className="error-subtitle font-heading text-lg font-semibold text-f1-muted tracking-widest uppercase relative z-10 mb-2">
        Page Not Found
      </p>

      {/* Error code */}
      <p className="error-code font-data text-xs text-f1-muted/70 tracking-widest relative z-10 mb-8">
        ERR_404 // SESSION_ABORTED
      </p>

      {/* Return to pits CTA */}
      <Link
        href="/"
        className="error-cta flex items-center gap-2 px-4 py-2 border border-f1-red bg-f1-red/10 text-f1-red text-sm font-data tracking-wide transition-colors duration-100 hover:bg-f1-red/20 cursor-pointer relative z-10"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        RETURN TO PITS
      </Link>
    </div>
  );
}
