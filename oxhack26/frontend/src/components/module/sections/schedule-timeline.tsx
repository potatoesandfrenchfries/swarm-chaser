"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { gsap, ScrollTrigger } from "~/lib/gsap";
import type { ScheduleEvent } from "~/lib/constants/schedule";
import { formatDay } from "~/lib/dates";
import { BulletLabel } from "../bullet-label";

type Chunk =
  | { kind: "gap"; minutes: number }
  | { kind: "event"; minutes: number; event: ScheduleEvent };

const toMinutes = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(v, hi));

function buildChunks(
  events: ScheduleEvent[],
  startHour: number,
  endHour: number
): Chunk[] {
  const lo = startHour * 60;
  const hi = endHour * 60;
  const items = events
    .map((e) => ({
      e,
      s: clamp(toMinutes(e.start), lo, hi),
      t: clamp(toMinutes(e.end), lo, hi),
    }))
    .filter(({ s, t }) => t > s)
    .sort((a, b) => a.s - b.s || a.t - b.t);

  const chunks: Chunk[] = [];
  let cursor = lo;
  for (const { e, s, t } of items) {
    if (s > cursor) chunks.push({ kind: "gap", minutes: s - cursor });
    chunks.push({ kind: "event", minutes: t - s, event: e });
    cursor = t;
  }
  if (cursor < hi) chunks.push({ kind: "gap", minutes: hi - cursor });
  return chunks;
}

type Props = {
  events: ScheduleEvent[];
  /** Element to pin while the timeline scrolls sideways (the whole section). */
  pinRef: React.RefObject<HTMLElement | null>;
  startHour?: number;
  endHour?: number;
  /** Gaps longer than this many minutes are squashed by `gapCompress`. */
  compressAfterMinutes?: number;
  gapCompress?: number;
  minEventWidth?: number;
};

/**
 * One 100vw column per day; events are positioned by time. While the section
 * is pinned, vertical scroll drives a horizontal translate of the track
 * (GSAP ScrollTrigger, scrubbed). Hovering a card wipes a black overlay in
 * from the left and flips the text to white.
 */
export function ScheduleTimeline({
  events,
  pinRef,
  startHour = 9,
  endHour = 23,
  compressAfterMinutes = 60,
  gapCompress = 0.25,
  minEventWidth = 144,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const pxPerMinute = (mobile ? 300 : 330) / 60;
  const rowHeight = mobile ? 280 : 330;

  const days = useMemo(() => {
    const byDay = new Map<string, ScheduleEvent[]>();
    for (const e of events) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
    return [...byDay.keys()].sort().map((day) => ({
      day,
      ...formatDay(day),
      chunks: buildChunks(byDay.get(day) ?? [], startHour, endHour),
    }));
  }, [events, startHour, endHour]);

  const gapWidth = (m: number) =>
    (Math.min(m, compressAfterMinutes) +
      Math.max(0, m - compressAfterMinutes) * gapCompress) *
    pxPerMinute;

  // Pin the section and map scroll progress to horizontal travel.
  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const pin = pinRef.current;
    if (!viewport || !track || !pin) return;

    const ctx = gsap.context(() => {
      const maxScroll = () =>
        Math.max(0, track.scrollWidth - viewport.offsetWidth);
      const navHeight =
        document.querySelector("nav")?.getBoundingClientRect().height ?? 56;

      ScrollTrigger.create({
        trigger: pin,
        start: mobile ? `top top+=${Math.round(navHeight)}` : "top top",
        end: () => `+=${maxScroll() + window.innerHeight * 0.3}`,
        pin: true,
        scrub: 1,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) =>
          gsap.set(track, { x: -maxScroll() * self.progress }),
      });
    });

    return () => ctx.revert();
  }, [days, mobile, pinRef]);

  return (
    <div className="w-full border-y">
      <div ref={viewportRef} className="relative overflow-hidden">
        <div ref={trackRef} className="flex">
          {days.map((d) => (
            <div
              key={d.day}
              className="flex min-w-[100vw] shrink-0 border-r last:border-r-0"
            >
              {/* desktop: big numeral rail */}
              <div className="hidden w-64 shrink-0 flex-col justify-center p-6 md:flex">
                <div className="flex items-end gap-1 leading-none">
                  <p className="font-display text-7xl font-bold">{d.number}</p>
                  <p className="mb-1 text-xs font-light uppercase">{d.month}</p>
                </div>
                <p className="ml-1 mt-1 font-heading text-base font-bold leading-none tracking-[3px]">
                  {d.weekday}
                </p>
              </div>

              <div className="relative min-w-0 flex-1">
                {/* mobile: compact date */}
                <div className="px-5 pt-5 md:hidden">
                  <div className="flex items-end leading-none">
                    <span className="font-display text-3xl font-bold">
                      {d.ordinal}
                    </span>
                    <BulletLabel className="mb-1 ml-2">{d.month}</BulletLabel>
                  </div>
                  <p className="font-heading text-[0.7rem] font-black uppercase">
                    {d.weekday}
                  </p>
                </div>

                <div
                  className="scrollbar-hide overflow-x-auto overflow-y-hidden px-6 py-6 md:px-8"
                  style={{ height: rowHeight }}
                  role="region"
                  aria-label={`${d.ordinal} ${d.month} timeline`}
                >
                  <div className="flex items-stretch">
                    {d.chunks.map((c, i) =>
                      c.kind === "gap" ? (
                        <div
                          key={`gap-${i}`}
                          aria-hidden
                          className="hidden shrink-0 md:block"
                          style={{ width: gapWidth(c.minutes) }}
                        />
                      ) : (
                        <EventCard
                          key={c.event.id}
                          event={c.event}
                          width={Math.max(
                            minEventWidth,
                            c.minutes * pxPerMinute
                          )}
                          height={rowHeight - 32}
                        />
                      )
                    )}
                  </div>
                </div>

                <div className="pointer-events-none absolute inset-y-0 left-0 z-30 w-8 bg-gradient-to-r from-background via-background/80 to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 z-30 w-8 bg-gradient-to-l from-background via-background/80 to-transparent" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Pure-CSS hover: a 2px ink sliver on the left grows to fill the card. */
function EventCard({
  event: e,
  width,
  height,
}: {
  event: ScheduleEvent;
  width: number;
  height: number;
}) {
  return (
    <article
      className="group relative mx-1.5 flex max-w-[70vw] shrink-0 flex-col overflow-hidden bg-background md:mx-2"
      style={{ width, height }}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-foreground transition-[clip-path] duration-300 ease-out [clip-path:inset(0_calc(100%-2px)_0_0)] group-hover:[clip-path:inset(0_0_0_0)]"
      />
      <div className="relative z-10 flex h-full flex-col p-4 transition-colors duration-300 group-hover:text-background">
        <p className="mb-3 whitespace-nowrap text-xs font-light 2xl:text-sm">
          {e.start} – {e.end}
        </p>
        <h3 className="mb-2 break-words font-heading text-base font-bold leading-tight xl:text-xl 2xl:text-2xl">
          {e.title}
        </h3>
        {e.location && (
          <p className="mb-2 break-words text-xs font-medium underline opacity-90">
            {e.location}
          </p>
        )}
        {e.description && (
          <p className="mt-auto line-clamp-4 flex-1 overflow-hidden text-xs leading-relaxed opacity-80">
            {e.description}
          </p>
        )}
      </div>
    </article>
  );
}
