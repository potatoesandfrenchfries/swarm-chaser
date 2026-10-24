import { AccentRibbon } from "./accent-ribbon";
import { RailwayAbout } from "./about";
import { RailwayFaq } from "./faq";
import { RailwayHero } from "./hero";
import { RailwaySchedule } from "./schedule";
import { RailwaySponsors } from "./sponsors";

/**
 * Hero, then one stripe-banded section per topic. Reorder freely; keep the
 * ids in sync with RAILWAY_SECTIONS in nav.ts. `overflow-x-clip` (not
 * `hidden`) so the ribbon's `position: sticky` still works.
 */
export function RailwayLanding() {
  return (
    <div className="w-full overflow-x-clip">
      <AccentRibbon />
      <RailwayHero />
      <RailwayAbout />
      <RailwaySponsors />
      <RailwaySchedule />
      <RailwayFaq />
    </div>
  );
}
