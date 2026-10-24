"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import {
  PARTICIPATE_LINKS,
  SOCIAL_LINKS,
  NAV_LINKS,
} from "~/lib/constants/navigation";
import { PRIMARY_CTA, SITE } from "~/lib/constants/site";
import { cn } from "~/lib/utils";
import { BulletLabel } from "../module/bullet-label";
import { NavLinks } from "./nav-links";
import { ScrambleLink } from "./scramble-link";

/** One row of the menu: bullet caption in the left third, content in the right two. */
function MenuRow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex items-start px-6 py-7">
      <div className="shrink-0 basis-1/3 pr-4">
        <BulletLabel className="text-[0.5625rem]">{title}</BulletLabel>
      </div>
      <div className="basis-2/3">{children}</div>
    </section>
  );
}

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const close = () => setOpen(false);

  // The sheet is portalled to <body> so it escapes the navbar's stacking
  // context and sits above the footer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(true)}
        className="flex h-nav items-center px-4"
      >
        <Menu className="size-6" />
      </button>

      {mounted &&
        createPortal(
          <>
            {/* backdrop */}
            <div
              aria-hidden
              onClick={close}
              className={cn(
                "pointer-events-auto fixed inset-0 z-[60] bg-foreground/40 transition-opacity duration-300",
                open ? "opacity-100" : "pointer-events-none opacity-0"
              )}
            />

            {/* bottom sheet */}
            <div
              id="mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              inert={!open}
              className={cn(
                "pointer-events-auto fixed inset-x-0 bottom-0 z-[60] max-h-[90dvh] overflow-y-auto bg-foreground text-background transition-transform duration-300 ease-out",
                open ? "translate-y-0" : "translate-y-full"
              )}
            >
              <div className="flex justify-end px-4 pt-4">
                <button type="button" aria-label="Close menu" onClick={close}>
                  <X className="size-5" />
                </button>
              </div>

              <div className="flex flex-col divide-y divide-background/15">
                <MenuRow title="Pages">
                  <NavLinks
                    links={NAV_LINKS}
                    inverse
                    onNavigate={close}
                    className="flex flex-col items-start gap-1"
                    linkClassName="font-heading text-2xl font-bold"
                  />
                </MenuRow>

                <MenuRow title="Connect">
                  <ul className="flex flex-col gap-2 text-[0.6875rem] uppercase tracking-wide">
                    {SOCIAL_LINKS.map((item) => (
                      <li key={item.href}>
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {item.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </MenuRow>

                <MenuRow title="Participate">
                  <div className="flex flex-col gap-2 text-[0.6875rem] tracking-wide">
                    <ScrambleLink
                      href={PRIMARY_CTA.href}
                      label={PRIMARY_CTA.label}
                      tone="inverse"
                      onClick={close}
                      className="w-fit"
                    />
                    <NavLinks
                      links={PARTICIPATE_LINKS}
                      inverse
                      onNavigate={close}
                      className="flex flex-col gap-2"
                      linkClassName="text-[0.6875rem]"
                    />
                  </div>
                </MenuRow>

                <p className="py-6 text-center text-[0.625rem] uppercase text-background/50">
                  {SITE.copyright}
                </p>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
