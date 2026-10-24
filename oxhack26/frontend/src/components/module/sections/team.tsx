import Image from "next/image";

import { TEAM_MEMBERS, type TeamMember } from "~/lib/constants/team";
import { SectionHeader } from "../section-header";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/**
 * Two stacked SVG shapes (portrait panel + role/bio tab) with a chamfered
 * outline. Interaction is CSS-only: hover nudges the tab up and swaps the
 * still for the gif; press inverts the tab to ink.
 */
function TeamCard({ member }: { member: TeamMember }) {
  const Tag = member.link ? "a" : "div";
  const linkProps = member.link
    ? { href: member.link, target: "_blank", rel: "noopener noreferrer" }
    : {};

  return (
    <Tag
      {...linkProps}
      className="group flex w-full max-w-[200px] flex-col transition-transform duration-300 active:scale-[0.98] sm:max-w-[260px] md:max-w-[280px] lg:max-w-[300px]"
    >
      {/* portrait panel */}
      <div className="relative aspect-[177/178] w-full">
        <svg
          viewBox="0 0 177 178"
          fill="none"
          className="h-full w-full"
          aria-hidden
        >
          <path
            d="M1 53.5V1H142.5L176 39.5V177.5H1V127.5L11 118.5V63.5L1 53.5Z"
            strokeWidth={0.5}
            className="fill-background stroke-border transition-colors group-active:stroke-foreground"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center pt-[9%]">
          <div className="clip-avatar relative aspect-square w-[68%] overflow-hidden bg-foreground/5">
            {member.image ? (
              <>
                <Image
                  src={member.image}
                  alt={member.name}
                  fill
                  className="object-cover"
                />
                {member.gif && (
                  <Image
                    src={member.gif}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover opacity-0 transition-opacity group-hover:opacity-100"
                  />
                )}
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted font-heading text-3xl font-bold text-foreground/70">
                {initials(member.name)}
              </div>
            )}
          </div>
          <p className="mt-3 line-clamp-2 px-2 text-center font-heading text-[0.6rem] font-semibold uppercase tracking-wide sm:mt-4 sm:text-xs md:text-sm">
            {member.name}
          </p>
        </div>
      </div>

      {/* role + bio tab */}
      <div className="relative aspect-[177/64] w-full transition-transform duration-300 group-hover:-translate-y-[3px]">
        <svg
          viewBox="0 0 177 64"
          fill="none"
          className="h-full w-full"
          aria-hidden
        >
          <path
            d="M1 45.15V0.5H176V63.5H16.9091L1 45.15Z"
            strokeWidth={0.5}
            className="fill-background stroke-border transition-colors group-active:fill-foreground group-active:stroke-foreground"
          />
        </svg>
        <div className="absolute inset-0 py-[0.55rem] pl-[1.52rem] pr-[0.3rem] transition-colors group-active:text-background">
          <p className="flex items-center gap-1 text-[0.4rem] font-bold uppercase tracking-wide sm:text-[0.6rem] xl:text-[0.7rem]">
            <span className="size-1 bg-current" />
            {member.role}
          </p>
          <p className="mt-1 line-clamp-3 pr-3 text-[0.35rem] leading-tight sm:text-[0.55rem] xl:text-[0.65rem]">
            {member.bio}
          </p>
        </div>
      </div>
    </Tag>
  );
}

export function Team() {
  return (
    <>
      <SectionHeader
        title="The Team"
        subtitle="The people making it happen behind the scenes"
      />
      <div className="mt-10 grid grid-cols-2 justify-items-center gap-4 px-4 sm:gap-8 md:grid-cols-3 md:gap-10 lg:grid-cols-4 lg:gap-12">
        {TEAM_MEMBERS.map((m) => (
          <TeamCard key={m.name} member={m} />
        ))}
      </div>
    </>
  );
}
