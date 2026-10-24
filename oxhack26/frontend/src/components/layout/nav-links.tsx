"use client";

import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";

import { scrollToSection } from "~/lib/gsap";
import { NAV_LINKS, type NavLink } from "~/lib/constants/navigation";
import { cn } from "~/lib/utils";
import { ScrambleLink } from "./scramble-link";

/**
 * On the landing page `/#id` links smooth-scroll with GSAP; from any other
 * page they fall through to a normal navigation to `/#id`.
 */
export function useAnchorClick(onNavigate?: () => void) {
  const pathname = usePathname();

  return (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith("/#") || pathname !== "/") return;
    e.preventDefault();
    const id = href.slice(2);
    if (onNavigate) {
      onNavigate();
      // let the menu start closing before the page moves
      setTimeout(() => scrollToSection(id), 220);
    } else {
      scrollToSection(id);
    }
  };
}

export function NavLinks({
  links = NAV_LINKS,
  inverse = false,
  className,
  linkClassName,
  onNavigate,
}: {
  links?: NavLink[];
  inverse?: boolean;
  className?: string;
  linkClassName?: string;
  onNavigate?: () => void;
}) {
  const onAnchorClick = useAnchorClick(onNavigate);

  return (
    <ul className={className}>
      {links.map(({ href, label }) => (
        <li key={href}>
          <ScrambleLink
            href={href}
            label={label}
            tone={inverse ? "inverse" : "default"}
            className={cn("text-xs", linkClassName)}
            onClick={(e) => onAnchorClick(e, href)}
          />
        </li>
      ))}
    </ul>
  );
}
