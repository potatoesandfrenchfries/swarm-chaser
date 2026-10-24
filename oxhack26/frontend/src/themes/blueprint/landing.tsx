import { Section } from "~/components/layout/section";
import { Faq } from "~/components/module/sections/faq";
import { Hero } from "~/components/module/sections/hero";
import { ScheduleSection } from "~/components/module/sections/schedule-section";
import { Sponsors } from "~/components/module/sections/sponsors";
import { Team } from "~/components/module/sections/team";
import { Volunteer } from "~/components/module/sections/volunteer";

/**
 * Section order = nav order. Each `id` must match an entry in
 * lib/constants/navigation.ts. Add, remove or reorder freely.
 */
export function BlueprintLanding() {
  return (
    <div className="h-full w-full pb-24">
      <Section id="about" containerClassName="relative h-screen py-0">
        <Hero />
      </Section>

      <ScheduleSection />

      <Section id="sponsors" bare>
        <Sponsors />
      </Section>

      <Section id="team">
        <Team />
      </Section>

      <Section id="faq">
        <Faq />
      </Section>

      <Section
        id="volunteer"
        containerClassName="flex min-h-screen items-center"
      >
        <Volunteer />
      </Section>
    </div>
  );
}
