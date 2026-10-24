import { Host_Grotesk } from "next/font/google";

/**
 * One family for everything: tight, bold, slightly geometric. railway.css maps
 * it onto the --font-mono / --font-display / --font-heading roles so shared
 * components pick it up. Swap for any bold grotesque via next/font/local.
 */
const host = Host_Grotesk({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-host",
  display: "swap",
});

export const railwayFontClassName = host.variable;
