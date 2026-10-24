export type NavLink = {
  href: string;
  label: string;
};

/** In-page anchors. `/#id` links scroll smoothly on the landing page. */
export const NAV_LINKS: NavLink[] = [
  { href: "/#about", label: "ABOUT" },
  { href: "/#schedule", label: "SCHEDULE" },
  { href: "/#sponsors", label: "SPONSORS" },
  { href: "/#team", label: "TEAM" },
  { href: "/#faq", label: "FAQ" },
];

export const SOCIAL_LINKS: NavLink[] = [
  { label: "GITHUB", href: "https://github.com" },
  { label: "INSTAGRAM", href: "https://instagram.com" },
  { label: "LINKEDIN", href: "https://linkedin.com" },
];

/** Extra links shown under "Participate" in the mobile menu. */
export const PARTICIPATE_LINKS: NavLink[] = [
  { href: "/#volunteer", label: "VOLUNTEER" },
];
