import Image from "next/image";

import {
  SPONSORS,
  type Sponsor,
  type SponsorTier,
} from "~/lib/constants/sponsors";
import { RailwaySection } from "./section";

const TIERS: SponsorTier[] = ["PLATINUM", "GOLD", "SILVER"];
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

function Logo({ sponsor }: { sponsor: Sponsor }) {
  return (
    <a
      href={sponsor.website}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-w-0 flex-col items-start gap-4 no-underline max-sm:col-span-2 max-sm:items-center max-sm:text-center"
    >
      {sponsor.logo ? (
        <Image
          src={sponsor.logo}
          alt=""
          width={200}
          height={60}
          className="h-[60px] w-full max-w-[200px] object-contain object-left max-sm:object-center"
        />
      ) : (
        <span className="flex h-[60px] items-center text-3xl font-bold tracking-tight">
          {sponsor.name}
        </span>
      )}
      {sponsor.logo && (
        <span className="text-[15px] leading-snug text-muted-foreground group-hover:text-foreground group-hover:underline">
          {sponsor.name}
        </span>
      )}
    </a>
  );
}

/** One row per tier: tier name on the left, a logo grid on the right. */
export function RailwaySponsors() {
  return (
    <RailwaySection
      id="sponsors"
      palette="green"
      title="Sponsors"
      stripeOpacity={0.6}
    >
      <p className="m-0 text-balance text-[clamp(20px,2.6vw,30px)] leading-snug">
        Thank you to the organisations making{" "}
        <strong className="text-[var(--accent)]">this event</strong> possible.
      </p>

      <div className="mt-10 grid">
        {TIERS.map((tier) => {
          const sponsors = SPONSORS.filter((s) => s.tier === tier);
          if (!sponsors.length) return null;
          return (
            <section
              key={tier}
              className="grid gap-6 border-t py-7 md:grid-cols-[140px_minmax(0,1fr)]"
            >
              <h3 className="text-[23px] font-bold leading-tight tracking-tight">
                {title(tier)}
              </h3>
              <div className="grid grid-cols-4 gap-x-6 gap-y-7 md:grid-cols-3 md:gap-7">
                {sponsors.map((s) => (
                  <Logo key={s.name} sponsor={s} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </RailwaySection>
  );
}
