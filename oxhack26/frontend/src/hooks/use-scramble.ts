"use client";

import { useCallback, useRef } from "react";

import { gsap, prefersReducedMotion } from "~/lib/gsap";

/**
 * GSAP ScrambleText hover effect. Attach `ref` to the element that contains
 * the label (and only the label), call `play` on mouseenter and `reset` on
 * mouseleave. Skipped for prefers-reduced-motion.
 */
export function useScramble<T extends HTMLElement = HTMLSpanElement>(
  label: string
) {
  const ref = useRef<T>(null);

  const play = useCallback(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    gsap.killTweensOf(el);
    gsap.to(el, {
      duration: 0.5,
      scrambleText: {
        text: label,
        chars: "upperCase",
        revealDelay: 0,
        speed: 0.6,
      },
    });
  }, [label]);

  const reset = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    gsap.killTweensOf(el);
    el.textContent = label;
  }, [label]);

  return { ref, play, reset };
}
