import { LogoMark } from "~/components/brand/logo-mark";
import { BulletLabel } from "~/components/module/bullet-label";
import { SITE } from "~/lib/constants/site";

/** Centred logo, display title, blurb and a date/location strip. Fills the viewport. */
export function Hero() {
  return (
    <div className="relative flex h-screen min-h-[600px] w-full items-center justify-center">
      <div className="flex scale-90 flex-col items-center px-4 text-center sm:scale-100">
        <LogoMark />
        <h1 className="mt-3 animate-fade-up font-display text-4xl font-bold sm:text-6xl md:text-7xl 2xl:text-8xl">
          {SITE.name}
        </h1>
        <p className="mt-6 max-w-3xl px-2 text-sm sm:text-base 2xl:max-w-4xl 2xl:text-2xl">
          {SITE.description}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
          <BulletLabel size="md">{SITE.dates}</BulletLabel>
          <BulletLabel size="md">{SITE.location}</BulletLabel>
        </div>
      </div>
    </div>
  );
}
