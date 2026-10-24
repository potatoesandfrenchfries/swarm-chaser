import { SITE } from "~/lib/constants/site";
import { Countdown } from "./countdown";
import { EventFacts } from "./event-facts";

/** Headline, live countdown and the key facts. Warm palette (the header's). */
export function RailwayHero() {
  return (
    <section
      data-palette="warm"
      aria-labelledby="hero-heading"
      className="pb-12 md:pb-20"
    >
      <div className="rw-content pt-8">
        {/* right padding keeps the heading clear of the hanging ribbon */}
        <h1
          id="hero-heading"
          className="text-balance text-[clamp(32px,4.3vw,56px)] font-bold leading-[1.08] tracking-[-0.03em] md:pr-28"
        >
          {SITE.heroLine}
        </h1>
        <Countdown target={SITE.startsAt} />
        <EventFacts />
      </div>
    </section>
  );
}
