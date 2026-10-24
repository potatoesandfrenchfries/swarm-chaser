import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Every colour is an HSL triplet defined in src/styles/globals.css, so a
 * re-skin is a change to CSS variables, not to components. See DESIGN.md.
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Body + labels. Everything is monospace by default.
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        // Hero titles, big numerals, section headers.
        display: ["var(--font-display)", "ui-sans-serif", "sans-serif"],
        // Card titles, FAQ questions, dashboard headings.
        heading: ["var(--font-heading)", "ui-sans-serif", "sans-serif"],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        destructive: "hsl(var(--destructive))",
        success: "hsl(var(--success))",
      },
      // Layout metrics of the fixed page frame (see components/layout/navbar).
      spacing: {
        frame: "var(--frame-gutter)",
        rail: "var(--frame-rail)",
        nav: "var(--nav-height)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [animate],
};

export default config;
