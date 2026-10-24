import {
  NAV_LINKS,
  SOCIAL_LINKS,
  type NavLink,
} from "~/lib/constants/navigation";
import { LEGAL_LINKS, SITE } from "~/lib/constants/site";
import { cn } from "~/lib/utils";
import { BulletLabel } from "../module/bullet-label";
import { ScrambleLink } from "./scramble-link";

function FooterColumn({
  title,
  items,
  className,
}: {
  title: string;
  items: NavLink[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 py-2 pl-2", className)}>
      <BulletLabel className="text-[0.5rem]">{title}</BulletLabel>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.href}>
            <ScrambleLink
              href={item.href}
              label={item.label}
              tone="inverse"
              className="text-[0.7rem]"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Inverse (ink) block: big wordmark on the left, two link columns, and a
 * credit / legal strip. 4-col x 5-row grid on md+, stacked on mobile.
 */
export function Footer() {
  return (
    <footer className="relative z-50 grid w-full gap-4 bg-foreground p-5 text-background sm:p-6 md:h-96 md:grid-cols-4 md:grid-rows-5">
      <div className="flex items-center justify-center border-background/20 md:col-span-2 md:row-span-4 md:border-r">
        <p className="select-none font-display text-[clamp(5rem,16vw,11rem)] font-bold leading-none">
          {SITE.shortName}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:hidden">
        <FooterColumn title="Discover" items={NAV_LINKS} />
        <FooterColumn title="Follow Us" items={SOCIAL_LINKS} />
      </div>
      <FooterColumn
        title="Discover"
        items={NAV_LINKS}
        className="hidden md:col-start-3 md:row-span-4 md:flex md:px-5 md:pl-1"
      />
      <FooterColumn
        title="Follow Us"
        items={SOCIAL_LINKS}
        className="hidden border-background/20 md:col-start-4 md:row-span-4 md:flex md:border-l md:px-5"
      />

      <div className="flex flex-col items-center justify-center gap-2 border-t border-background/20 px-5 py-3 text-[0.6rem] uppercase sm:flex-row sm:justify-between sm:px-10 md:col-span-4 md:row-start-5">
        <p className="opacity-50">
          Made with &lt;3 by:{" "}
          {SITE.credits.map((c, i) => (
            <span key={c.name}>
              {i > 0 && ", "}
              <a href={c.href} className="underline">
                {c.name}
              </a>
            </span>
          ))}
        </p>
        <p>
          {LEGAL_LINKS.map((l, i) => (
            <span key={l.href}>
              {i > 0 && <span className="opacity-50"> | </span>}
              <a
                href={l.href}
                className="underline opacity-50 hover:opacity-100"
              >
                {l.label}
              </a>
            </span>
          ))}
        </p>
      </div>
    </footer>
  );
}
