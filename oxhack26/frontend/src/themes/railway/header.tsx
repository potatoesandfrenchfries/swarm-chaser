import Link from "next/link";

import { LogoMark } from "~/components/brand/logo-mark";
import { SITE } from "~/lib/constants/site";
import { RAILWAY_SECTIONS } from "./nav";
import { Stripes } from "./stripes";
import { TrackEnd } from "./track-end";
import { TrainNav } from "./train-nav";

/**
 * Three stacked bands, not fixed (it scrolls away):
 *   1. carriage nav
 *   2. banner: stripes, tracks weaving in from both sides, brand lockup
 *   3. in-page anchor links
 * Below 930px the weaving ends are dropped and only the stripes remain.
 */
export function RailwayHeader() {
  return (
    <header>
      <TrainNav />

      <div className="relative grid min-h-[88px] grid-cols-[minmax(0,1fr)_max-content_minmax(0,1fr)] items-center text-neutral-950 sm:min-h-[120px]">
        <Stripes />
        <TrackEnd
          side="left"
          className="col-start-1 row-start-1 hidden w-full justify-self-start min-[930px]:block"
        />
        <Link
          href="/"
          className="relative col-start-2 row-start-1 mx-auto flex w-max items-center justify-center gap-[clamp(10px,2.2vw,28px)] py-1.5 text-[clamp(22px,5.4vw,40px)] no-underline focus-visible:outline-neutral-950 min-[651px]:text-[clamp(25px,8vw,80px)]"
        >
          <LogoMark className="size-[1.2em] 2xl:size-[1.2em]" />
          <span className="whitespace-nowrap font-bold leading-none tracking-[-0.035em]">
            {SITE.name}
          </span>
        </Link>
        <TrackEnd
          side="right"
          className="col-start-3 row-start-1 hidden w-full justify-self-end min-[930px]:block"
        />
      </div>

      <nav
        aria-label="Sections"
        className="rw-content flex flex-wrap gap-x-8 border-b py-4"
      >
        {RAILWAY_SECTIONS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex min-h-11 items-center text-[17px] font-bold underline decoration-1 underline-offset-[0.2em] transition-colors hover:text-[var(--accent)]"
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
