import type { NavLink } from "~/lib/constants/navigation";

/** In-page anchors for the railway landing page. Ids match landing.tsx. */
export const RAILWAY_SECTIONS: NavLink[] = [
  { href: "/#about", label: "About" },
  { href: "/#sponsors", label: "Sponsors" },
  { href: "/#schedule", label: "Schedule" },
  { href: "/#faqs", label: "FAQs" },
];
