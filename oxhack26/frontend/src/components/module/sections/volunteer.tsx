import { ArrowRight } from "lucide-react";

import { ChamferButton } from "~/components/ui/chamfer-button";
import { BulletLabel } from "../bullet-label";
import { PhotoStack } from "../photo-stack";

/**
 * Closing call-to-action: eyebrow, shouty heading, tag-shaped button and a
 * photo stack. Point `href` at a sign-up form.
 */
export function Volunteer() {
  return (
    <div className="grid grid-cols-1 items-center gap-x-16 gap-y-10 px-6 sm:px-8 lg:grid-cols-12 lg:px-10">
      <div className="max-w-2xl space-y-6 lg:col-span-7">
        <BulletLabel size="md" className="text-xs">
          We need more hands
        </BulletLabel>
        <h2 className="font-heading text-2xl font-black uppercase leading-tight tracking-tight md:text-3xl lg:text-4xl">
          From photography to serving food, this is your chance to help the
          event shine
        </h2>
        <ChamferButton
          shape="tag"
          label="VOLUNTEER"
          href="https://example.com/volunteer"
          external
          icon={<ArrowRight className="size-4" />}
        />
      </div>

      <div className="w-full max-w-xl lg:col-span-5">
        <PhotoStack alt="Volunteers at last year's event" />
      </div>
    </div>
  );
}
