/**
 * Which theme the site builds with. Set NEXT_PUBLIC_THEME in .env.local.
 * Kept free of component imports so it is safe to use anywhere.
 */
export const THEME_NAMES = ["blueprint", "railway"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export const THEME_NAME: ThemeName =
  THEME_NAMES.find((n) => n === process.env.NEXT_PUBLIC_THEME) ?? "blueprint";
