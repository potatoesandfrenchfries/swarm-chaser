"use client";

import { gsap } from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";

/**
 * Single place plugins are registered. Import `gsap` from here (not "gsap")
 * so ScrollTo / ScrollTrigger / ScrambleText are always available.
 */
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollToPlugin, ScrollTrigger, ScrambleTextPlugin);
}

export { gsap, ScrollTrigger };

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Distance from the viewport top that anchored sections should stop at. */
export const SCROLL_OFFSET = 88;

/** Smooth-scroll to an element id, clearing the fixed navbar. */
export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (prefersReducedMotion()) {
    el.scrollIntoView();
    return;
  }
  gsap.to(window, {
    duration: 0.6,
    ease: "power2.out",
    scrollTo: { y: el, offsetY: SCROLL_OFFSET },
  });
}
