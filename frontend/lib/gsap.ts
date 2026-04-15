import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { SplitText } from "gsap/SplitText";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Flip } from "gsap/Flip";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { CustomEase } from "gsap/CustomEase";

// Only register plugins + create custom eases in the browser.
// GSAP plugin registration calls window APIs; running them in the Node.js
// SSR context (Next.js prerender) would throw or silently corrupt state.
if (typeof window !== "undefined") {
  gsap.registerPlugin(
    DrawSVGPlugin,
    SplitText,
    ScrollTrigger,
    Flip,
    MotionPathPlugin,
    CustomEase,
    useGSAP
  );

  // Custom eases matching F1 physics
  // Fast start, smooth settle — like a car accelerating then hitting the rev limiter
  CustomEase.create("pitwall-accel", "M0,0 C0.1,0.9 0.5,1 1,1");

  // Gradual start, sharp end — like trail braking into a corner
  CustomEase.create("pitwall-brake", "M0,0 C0.5,0 0.9,0.9 1,1");

  // Symmetric pulse for status indicators
  CustomEase.create("pitwall-pulse", "M0,0 C0.4,0.8 0.6,0.8 1,0");
}

/** Returns true if the user has prefers-reduced-motion: reduce set */
export const respectsReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export {
  gsap,
  useGSAP,
  DrawSVGPlugin,
  SplitText,
  ScrollTrigger,
  Flip,
  MotionPathPlugin,
  CustomEase,
};
