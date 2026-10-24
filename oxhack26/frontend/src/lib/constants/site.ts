/**
 * Everything event-specific lives in src/lib/constants/*. Edit these files
 * and the whole site follows; components never hardcode event copy.
 */
export const SITE = {
  name: "Your Event",
  shortName: "EVT",
  edition: "01",
  tagline: "Come together",
  description:
    "A weekend of talks, workshops and conversation. Everyone is welcome, whatever your background.",
  location: "Your City, Your Country",
  dates: "01–02 Nov 2026",
  url: "https://example.com",
  copyright: "©Your Organisation",
  /** ISO instant the event starts. Drives the railway theme's countdown. */
  startsAt: "2026-11-01T10:00:00+00:00",
  /** Headline above the countdown (railway theme). */
  heroLine: "Our next event begins in…",
  /** Label/value tiles under the countdown (railway theme). `href` makes one a link. */
  facts: [
    { label: "Location", value: "Main Building, Your City" },
    { label: "Date", value: "1st–2nd November" },
    { label: "Capacity", value: "300" },
    { label: "Start", value: "10:00 (Sunday)" },
    { label: "End", value: "17:00 (Monday)" },
    { label: "Format", value: "In person" },
  ] as { label: string; value: string; href?: string }[],
  /** Three short lines on the colour-shifting ribbon (railway theme). */
  ribbon: ["OFFICIAL", "MEMBER", "2026"] as string[],
  // Shown in "MADE WITH <3 BY" in the footer and mobile menu.
  credits: [{ name: "Your Name", href: "https://example.com" }],
} as const;

export type RegistrationState = "open" | "closed";

export const REGISTRATION: RegistrationState =
  process.env.NEXT_PUBLIC_REGISTRATION === "closed" ? "closed" : "open";

/** Primary call-to-action. Swap for auth-aware logic once you have accounts. */
export const PRIMARY_CTA = {
  open: { label: "REGISTER", href: "/register" },
  closed: { label: "SIGN IN", href: "/registration-closed" },
}[REGISTRATION];

export const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/documents/privacy-policy.pdf" },
  { label: "Code Of Conduct", href: "/documents/code-of-conduct.pdf" },
] as const;
