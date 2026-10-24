import { Chakra_Petch, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

/**
 * Font roles (see DESIGN.md). To use your own faces, swap each block for
 * `next/font/local` and keep the same `variable` names.
 */
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

const display = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const heading = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-heading",
  display: "swap",
});

export const blueprintFontClassName = `${mono.variable} ${display.variable} ${heading.variable}`;
