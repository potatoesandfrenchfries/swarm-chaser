"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Container } from "~/components/layout/container";
import { gsap } from "~/lib/gsap";
import { SPONSORS, type Sponsor } from "~/lib/constants/sponsors";
import { pad2 } from "~/lib/utils";
import { BulletLabel } from "../bullet-label";
import { Collapse } from "../collapse";
import { CornerBrackets } from "../corner-brackets";
import { Redacted } from "../redacted";
import { SectionHeader } from "../section-header";

/** Logo image, or the sponsor name set in the heading face when none is supplied. */
function SponsorLogo({
  sponsor,
  className,
}: {
  sponsor: Sponsor;
  className?: string;
}) {
  return sponsor.logo ? (
    <Image
      src={sponsor.logo}
      alt={`${sponsor.name} logo`}
      width={200}
      height={120}
      className={className ?? "max-h-32 max-w-full object-contain"}
    />
  ) : (
    <span className="text-center font-heading text-3xl font-bold uppercase">
      {sponsor.name}
    </span>
  );
}

/** Overview + perks list, shared by the desktop card and the mobile expander. */
function SponsorDetails({ sponsor }: { sponsor: Sponsor }) {
  return (
    <div className="grid grid-cols-1 gap-6 text-[0.8rem] font-light uppercase tracking-wide lg:grid-cols-2">
      <div className="flex gap-4">
        <p>Overview:</p>
        <p>{sponsor.overview}</p>
      </div>
      <div className="flex gap-4">
        <p>Perks:</p>
        <ul className="space-y-1">
          {sponsor.perks.map((perk) => (
            <li
              key={perk.label + perk.text}
              className="flex items-center gap-3"
            >
              <span className="shrink-0">{perk.label}:</span>
              {perk.revealed ? (
                <span className="normal-case leading-relaxed">{perk.text}</span>
              ) : (
                <Redacted>{perk.text}</Redacted>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DesktopCard({
  sponsor,
  index,
  onHover,
}: {
  sponsor: Sponsor;
  index: number;
  onHover: () => void;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  // Brackets pulse inward on click
  const pulse = () => {
    const corners = ref.current?.querySelectorAll("[data-corner]");
    if (!corners) return;
    gsap.to(corners, {
      scale: 0.98,
      duration: 0.2,
      ease: "power4.inOut",
      yoyo: true,
      repeat: 1,
      transformOrigin: "center",
    });
  };

  return (
    <a
      ref={ref}
      href={sponsor.website}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={onHover}
      onFocus={onHover}
      onClick={pulse}
      className="group relative block px-10 pb-12 pt-7"
    >
      <CornerBrackets />
      {/* three-square handle, fills in on hover */}
      <div aria-hidden className="absolute right-5 top-5 flex flex-col gap-1">
        {[0, 1, 2].map((n) => (
          <span
            key={n}
            className="size-1.5 border border-current transition-colors duration-200 group-hover:bg-foreground"
            style={{ transitionDelay: `${n * 20}ms` }}
          />
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <h3 className="mt-3 font-heading text-4xl font-bold uppercase leading-none transition-transform duration-300 group-hover:translate-x-1 md:text-5xl">
          {sponsor.name}
        </h3>
        <BulletLabel size="md" className="font-light">
          {sponsor.tier}
        </BulletLabel>
      </div>
      <div className="my-6 h-px w-full bg-foreground sm:my-8" />
      <SponsorDetails sponsor={sponsor} />

      <span className="label absolute bottom-5 left-5 font-light">
        {pad2(index + 1)}
      </span>
      <span className="label absolute bottom-5 right-5 font-light">+</span>
    </a>
  );
}

function MobileCard({ sponsor, index }: { sponsor: Sponsor; index: number }) {
  const [open, setOpen] = useState(false);
  const panelId = `sponsor-panel-${index}`;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-40 w-full items-center justify-center p-4 sm:h-48"
      >
        <CornerBrackets />
        <SponsorLogo
          sponsor={sponsor}
          className="max-h-24 max-w-full object-contain"
        />
        <span className="label absolute bottom-4 left-4 font-medium">
          {sponsor.tier}
        </span>
        <span className="label absolute right-4 top-4 font-light">
          {open ? "−" : "+"}
        </span>
      </button>
      <Collapse open={open} id={panelId}>
        <div className="space-y-6 px-6 pb-4 pt-6">
          <div className="flex items-end gap-3">
            <h3 className="font-heading text-2xl font-bold uppercase">
              {sponsor.name}
            </h3>
            <BulletLabel className="font-light">{sponsor.tier}</BulletLabel>
          </div>
          <div className="h-px bg-foreground" />
          <SponsorDetails sponsor={sponsor} />
          <a
            href={sponsor.website}
            target="_blank"
            rel="noopener noreferrer"
            className="label inline-block underline"
          >
            Visit website ↗
          </a>
        </div>
      </Collapse>
    </div>
  );
}

/**
 * Desktop: sticky logo panel on the left that crossfades to whichever card is
 * hovered/focused. Mobile: a stack of logo tiles that expand on tap.
 */
export function Sponsors() {
  const [active, setActive] = useState(0);
  const logoRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const current = SPONSORS[active];

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    gsap.fromTo(
      logoRef.current,
      { autoAlpha: 0, scale: 0.8, y: -20 },
      { autoAlpha: 1, scale: 1, y: 0, duration: 0.25, ease: "power2.inOut" }
    );
  }, [active]);

  return (
    <Container className="relative min-h-screen py-16 sm:py-24">
      <SectionHeader
        title="Sponsors"
        subtitle="Meet the organisations making this event possible"
        className="mb-10"
      />

      <div className="grid gap-8 lg:hidden">
        {SPONSORS.map((s, i) => (
          <MobileCard key={s.name} sponsor={s} index={i} />
        ))}
      </div>

      <div className="hidden gap-12 lg:flex">
        <div className="w-80 shrink-0 self-start lg:sticky lg:top-28">
          <div className="relative flex h-72 items-center justify-center overflow-hidden p-8">
            <CornerBrackets />
            <div ref={logoRef} className="flex items-center justify-center">
              {current && <SponsorLogo sponsor={current} />}
            </div>
            <BulletLabel
              size="md"
              className="absolute bottom-4 left-4 font-light"
            >
              [LOGO]
            </BulletLabel>
          </div>
        </div>

        <div className="max-w-6xl flex-1 space-y-8">
          {SPONSORS.map((s, i) => (
            <DesktopCard
              key={s.name}
              sponsor={s}
              index={i}
              onHover={() => setActive(i)}
            />
          ))}
        </div>
      </div>
    </Container>
  );
}
