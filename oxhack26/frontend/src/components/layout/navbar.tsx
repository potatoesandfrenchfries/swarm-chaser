import { ChamferButton } from "../ui/chamfer-button";
import { MobileMenu } from "./mobile-menu";
import { NavLinks } from "./nav-links";
import { PRIMARY_CTA } from "~/lib/constants/site";

/**
 * The fixed page frame. Four layers on a 3x3 grid:
 *
 *   ┌───────── blurred gutter (h-frame) ─────────┐
 *   │ ┌────────────── top bar ────────────────┐ │
 *   │ │ rail │      page shows through       │ │ ← border + rounded corners
 *   │ └──────────── bottom bar ───────────────┘ │
 *   └───────── blurred gutter (h-frame) ─────────┘
 *
 * The frame never intercepts clicks (pointer-events-none) except the bars.
 * Page content must clear it: use `.frame-top` / `.frame-inset` (globals.css)
 * or the Container used by landing sections.
 *
 * Below md only the top bar remains.
 */
export function Navbar() {
  const gutter = (className: string) => (
    <div
      aria-hidden
      className={`hidden backdrop-blur-sm md:block ${className}`}
    />
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-40 md:grid md:grid-cols-[auto_1fr_auto] md:grid-rows-[auto_1fr_auto]">
      {gutter("col-span-3 h-frame w-full")}
      {gutter("h-full w-frame")}

      <div className="flex h-full w-full flex-col md:rounded-lg md:border">
        <nav className="pointer-events-auto relative flex h-nav w-full items-center justify-between border-b bg-background md:rounded-t-lg">
          <MobileMenu />

          <NavLinks
            className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-14 lg:flex"
            linkClassName="px-1"
          />

          <div className="ml-auto hidden h-full lg:flex">
            <ChamferButton
              label={PRIMARY_CTA.label}
              href={PRIMARY_CTA.href}
              className="translate-x-px"
            />
          </div>
        </nav>

        <div
          aria-hidden
          className="hidden h-full w-rail border-r bg-background md:block"
        />
        <div
          aria-hidden
          className="hidden h-nav w-full border-t bg-background md:block md:rounded-b-lg"
        />
      </div>

      {gutter("h-full w-frame")}
      {gutter("col-span-3 h-frame w-full")}
    </div>
  );
}
