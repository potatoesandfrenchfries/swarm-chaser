"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PRIMARY_CTA } from "~/lib/constants/site";
import { cn } from "~/lib/utils";

const label = (s: string) => s.toLowerCase();

/**
 * The row of carriages above the banner: where you are, the main action,
 * and account. Scrolls sideways when it doesn't fit.
 */
export function TrainNav() {
  const pathname = usePathname();

  const items = [
    { href: "/", text: "Event" },
    { href: PRIMARY_CTA.href, text: label(PRIMARY_CTA.label), primary: true },
    { href: "/dashboard", text: "Dashboard" },
  ];

  return (
    <nav aria-label="Site navigation" className="rw-train" tabIndex={0}>
      {items.map(({ href, text, primary }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className={cn(
            "rw-carriage capitalize",
            primary && "rw-carriage--primary"
          )}
        >
          <span>{text}</span>
        </Link>
      ))}
    </nav>
  );
}
