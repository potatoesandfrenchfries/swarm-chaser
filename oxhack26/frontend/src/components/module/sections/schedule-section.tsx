"use client";

import { useRef } from "react";

import { Container } from "~/components/layout/container";
import { SCHEDULE } from "~/lib/constants/schedule";
import { SectionHeader } from "../section-header";
import { ScheduleTimeline } from "./schedule-timeline";

/**
 * Client wrapper so the whole section (header + timeline) is the pinned
 * element. The id matches the "/#schedule" nav link.
 */
export function ScheduleSection() {
  const ref = useRef<HTMLElement>(null);

  return (
    <section
      id="schedule"
      ref={ref}
      className="scroll-mt-24 md:scroll-mt-28 2xl:scroll-mt-40"
    >
      <Container>
        <SectionHeader
          title="Schedule"
          subtitle="Discover how the weekend will unfold"
          className="pb-10"
        />
        <ScheduleTimeline events={SCHEDULE} pinRef={ref} />
        <p className="label mt-3 flex items-center gap-2 font-thin 2xl:hidden">
          <span className="inline-block size-1 bg-foreground" />
          Keep scrolling to see the full schedule
        </p>
      </Container>
    </section>
  );
}
