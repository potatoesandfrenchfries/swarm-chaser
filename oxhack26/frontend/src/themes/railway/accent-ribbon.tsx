"use client";

import { useEffect, useRef } from "react";

import { SITE } from "~/lib/constants/site";

/**
 * A ribbon that hangs from the top of the viewport and takes on the colour of
 * whichever section is under it. Position is CSS `sticky` (the wrapper is
 * zero-height and sits at the top of a tall parent); colour is an
 * IntersectionObserver on `[data-palette]` sections writing `--ribbon`.
 * Hidden on narrow screens.
 */
export function AccentRibbon() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sections = document.querySelectorAll<HTMLElement>(
      "section[data-palette]"
    );

    // Watch a thin strip at the very top of the viewport.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const colour = getComputedStyle(entry.target)
            .getPropertyValue("--ribbon")
            .trim();
          if (colour) el.style.setProperty("--ribbon", colour);
        }
      },
      { rootMargin: "0px 0px -98% 0px" }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  const [top = "", middle = "", bottom = ""] = SITE.ribbon;

  return (
    <div className="pointer-events-none sticky top-0 z-30 -mt-[77px] mb-[77px] hidden h-0 sm:block">
      <div
        ref={ref}
        className="rw-ribbon absolute right-4 top-0 w-[clamp(64px,calc(60px+1.5vw),90px)] md:right-10"
        aria-hidden
      >
        <svg viewBox="0 0 90 156" className="block w-full">
          <path className="rw-ribbon__body" d="M0 0H90V148L45 128L0 148Z" />
          <g fontWeight={700} textAnchor="middle" fontSize="13">
            <text x="45" y="38" fill="#fff">
              {top}
            </text>
            <rect x="0" y="54" width="90" height="26" fill="#fff" />
            <text x="45" y="72" fontSize="12" style={{ fill: "var(--ribbon)" }}>
              {middle}
            </text>
            <text x="45" y="104" fill="#fff" fontSize="11">
              {bottom}
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}
