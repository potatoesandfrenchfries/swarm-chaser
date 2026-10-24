import type { ComponentType } from "react";

import { Footer as BlueprintFooter } from "~/components/layout/footer";
import { Navbar as BlueprintHeader } from "~/components/layout/navbar";
import { blueprintFontClassName } from "./blueprint/fonts";
import { BlueprintLanding } from "./blueprint/landing";
import { THEME_NAME, type ThemeName } from "./config";
import { railwayFontClassName } from "./railway/fonts";
import { RailwayFooter } from "./railway/footer";
import { RailwayHeader } from "./railway/header";
import { RailwayLanding } from "./railway/landing";

/**
 * A theme is: tokens (CSS), fonts, and the three structural pieces that
 * differ between designs. Everything else (register, status, dashboard,
 * buttons, inputs) is built on semantic tokens and re-themes by itself.
 */
export type Theme = {
  name: ThemeName;
  /** next/font variable classes for this theme only. */
  fontClassName: string;
  /** Site header: fixed frame (blueprint) or train banner (railway). */
  Header: ComponentType;
  Footer: ComponentType;
  /** The `/` page body. */
  Landing: ComponentType;
  /** <main> wrapper on landing routes. */
  shellClassName: string;
  /** <main> classes on signed-in routes; must clear the header. */
  mainClassName: string;
  /** Pulls a full-bleed block back out of `mainClassName`'s inset. */
  bleedClassName: string;
};

const THEMES: Record<ThemeName, Theme> = {
  blueprint: {
    name: "blueprint",
    fontClassName: blueprintFontClassName,
    Header: BlueprintHeader,
    Footer: BlueprintFooter,
    Landing: BlueprintLanding,
    shellClassName: "flex min-h-screen flex-col items-center",
    mainClassName: "frame-top frame-inset",
    bleedClassName:
      "md:-ml-[calc(var(--frame-gutter)+var(--frame-rail))] md:-mr-frame",
  },
  railway: {
    name: "railway",
    fontClassName: railwayFontClassName,
    Header: RailwayHeader,
    Footer: RailwayFooter,
    Landing: RailwayLanding,
    shellClassName: "flex min-h-screen flex-col",
    mainClassName: "mx-auto max-w-[1100px] px-4 md:px-6",
    bleedClassName: "",
  },
};

export const theme = THEMES[THEME_NAME];
