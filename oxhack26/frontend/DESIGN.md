# Design: blueprint theme

The template ships two themes (see **Themes** below). This document describes
**blueprint**, the white, framed, chamfered one. Read this before restyling
anything: most of the look comes from a handful of repeated rules, and the code
is organised around them.

> **Left out on purpose:** auth, database, uploads, email (backend concerns,
> see §9).

## Themes

| Theme                 | Look                                                                    | Doc                                      |
| --------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| `blueprint` (default) | White paper, ink, hairlines, fixed bordered frame, chamfered corners    | this file                                |
| `railway`             | Dark, four-band stripes in a palette per section, train-line navigation | [DESIGN.railway.md](./DESIGN.railway.md) |

Pick one with `NEXT_PUBLIC_THEME` in `.env.local` (build-time). A theme is
tokens + fonts + three structural pieces (header, footer, landing page),
registered in `src/themes/index.ts`. Everything else (register, status,
dashboard, buttons, inputs) is built on semantic tokens and re-themes itself.
To add a third theme, see _Adding a theme_ in DESIGN.railway.md.

---

## 1. Character

Six rules. If a new component breaks one, it will look out of place.

1. **Ink on paper.** White page, near-black ink, grey hairlines. No shadows,
   no gradients (except the schedule edge fades), no radius, with one exception:
   the outer page frame.
2. **Everything is a label.** Tiny uppercase monospace captions, usually
   introduced by a solid square bullet. Section subtitles, tier tags, role tags,
   "3 QUESTIONS", "[LOGO]" are all the same thing (`BulletLabel`).
3. **Cut corners, not curves.** Shapes are chamfered (45° cuts) via `clip-path`
   or SVG paths: CTA buttons, avatars, team cards, corner brackets.
4. **Indexed.** Things are numbered (`01`, `02`) or counted. It reads like a
   technical document.
5. **Small, mechanical motion.** Wipes, clip-path fills, text scrambles. Short
   (≤ 0.6 s), no bounce, nothing floats.
6. **Tease, don't reveal.** Redacted perks, `LOCKED` form steps, disabled
   "COMING SOON" tabs. Unfinished states are part of the aesthetic.

---

## 2. The page frame

The signature element. A fixed, bordered frame wraps the viewport, and the page
scrolls _inside_ it.

```text
 ┌─────────────── blurred gutter · h-frame (20px) ───────────────┐
 │ ┌───────────────────── top bar · h-nav (56px) ──────────────┐ │
 │ │ links centred · CTA flush right, bottom-left chamfered    │ │
 │ ├──────┬────────────────────────────────────────────────────┤ │
 │ │ rail │                                                    │ │
 │ │ w-rail│        page content scrolls through here          │ │
 │ │ (56px)│                                                   │ │
 │ ├──────┴────────────────────────────────────────────────────┤ │
 │ └──────────────────── bottom bar · h-nav ───────────────────┘ │
 └───────────────────────────────────────────────────────────────┘
        gutters blur (backdrop-blur-sm) whatever scrolls beneath
```

| Piece           | Where                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| Frame + bars    | `components/layout/navbar.tsx`                                             |
| Metrics         | CSS vars in `styles/globals.css` → Tailwind `frame`, `rail`, `nav` spacing |
| Mobile (< `md`) | Only the top bar remains; menu is a bottom sheet                           |

**Clearing the frame.** Content must not sit under the bars:

- Landing sections use `Container` (`sm:px-24` clears the rail).
- App pages use the `(app)` layout, which applies `.frame-top` + `.frame-inset`.
- Full-bleed blocks that must escape the inset (footer on the dashboard) use a
  negative margin; see `app/(app)/dashboard/layout.tsx`.
- Anchored sections need `scroll-mt-24 md:scroll-mt-28` (`Section` does this),
  and GSAP scrolls to `SCROLL_OFFSET = 88` px.

---

## 3. Tokens

All colour is an HSL triplet CSS variable in `styles/globals.css`, mapped in
`tailwind.config.ts`. **Use semantic classes, never `bg-black` / `text-white`.**
Inverse surfaces are `bg-foreground text-background`, so the dark theme and any
re-skin come for free.

### Colour

| Token                     | Light        | Use                                                        |
| ------------------------- | ------------ | ---------------------------------------------------------- |
| `background`              | white        | Page, bars, cards                                          |
| `foreground`              | `0 0% 4%`    | Text, solid buttons, footer, bullets                       |
| `muted`                   | `0 0% 96%`   | Open accordion row, disabled tab                           |
| `muted-foreground`        | `0 0% 40%`   | Secondary text, field labels                               |
| `border`                  | `0 0% 90%`   | **Every** hairline (`border-border` is the global default) |
| `ring`                    | = foreground | Focus rings                                                |
| `destructive` / `success` | red / green  | Validation, toasts                                         |

The palette is deliberately monochrome. If you add a brand colour, add it as
**one** new token and spend it on one thing (e.g. active tab, bullet squares).
Don't tint the greys.

### Type: three roles

| Class          | Role                                                      | Face          |
| -------------- | --------------------------------------------------------- | ------------- |
| `font-mono`    | **Body and all labels.** Applied to `<body>`.             | IBM Plex Mono |
| `font-display` | Hero title, section titles, big numerals, footer wordmark | Chakra Petch  |
| `font-heading` | Card titles, FAQ questions, dashboard titles, day names   | Space Grotesk |

Swap faces in `themes/blueprint/fonts.ts` and keep the three `--font-*` variable names.
Pick a display face that is wide and angular so it matches the chamfers.

Scale (rem unless noted):

| Use              | Size                             | Treatment                            |
| ---------------- | -------------------------------- | ------------------------------------ |
| Label (`.label`) | 0.625 (0.5–0.7 in cramped spots) | uppercase, `tracking-wide`           |
| Body             | `text-xs` → `text-sm`            | mono, normal case                    |
| Section title    | `text-5xl md:text-6xl`           | display, bold, `-ml-1` optical align |
| Hero title       | `text-4xl` → `2xl:text-8xl`      | display, bold                        |
| Card / FAQ title | `text-base` → `text-5xl`         | heading, bold/medium                 |

### Everything else

- **Borders:** 1px, `border-border`. Lists are `divide-y`; boxes are `border`.
  Strong rules (`h-px bg-foreground`) appear only inside sponsor cards.
- **Radius:** none, except the frame (`rounded-lg`).
- **Bullets:** `size-1.5`–`size-2` solid squares, never circles.
- **Z-index:** frame `40` · footer `50` · mobile sheet `60` (portalled to `<body>`
  so it clears the footer).

---

## 4. Motifs and components

| Motif / component  | File                                    | What it is                                                                                                                 |
| ------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `BulletLabel`      | `module/bullet-label.tsx`               | Square + tiny caps text. Bullet follows `currentColor`, so it works on ink.                                                |
| `SectionHeader`    | `module/section-header.tsx`             | Display title + `BulletLabel` subtitle.                                                                                    |
| `CornerBrackets`   | `module/corner-brackets.tsx`            | Four chamfered L-brackets on the parent's corners. Cards without borders. Tagged `data-corner` for GSAP.                   |
| `ChamferButton`    | `ui/chamfer-button.tsx`                 | Solid ink button. `shape="corner"` (cut bottom-left, navbar) or `"tag"` (ticket shape, secondary CTA). Scrambles on hover. |
| `ScrambleLink`     | `layout/scramble-link.tsx`              | Link whose bar wipes in from the left and text scrambles. `tone="inverse"` on ink.                                         |
| `Collapse`         | `module/collapse.tsx`                   | Height animation by `grid-rows 0fr→1fr`. No measuring.                                                                     |
| `Redacted`         | `module/redacted.tsx`                   | Black bar over text.                                                                                                       |
| `Faq`              | `sections/faq.tsx`                      | Numbered, single-open accordion; open row tints; `+` rotates 45° into ×.                                                   |
| `ScheduleTimeline` | `sections/schedule-timeline.tsx`        | One 100vw column per day; events sized by duration; pinned section scrolls sideways.                                       |
| `Sponsors`         | `sections/sponsors.tsx`                 | Desktop: sticky logo panel follows the hovered card. Mobile: logo tiles expand on tap.                                     |
| `Team`             | `sections/team.tsx`                     | Chamfered two-part cards (portrait + role tab); press inverts the tab.                                                     |
| `PhotoStack`       | `module/photo-stack.tsx`                | Two polaroids, back one tilted; hover straightens/scales.                                                                  |
| `DashboardShell`   | `module/dashboard/dashboard-shell.tsx`  | Header + 2-col tab grid; active tab is solid ink; tab in `?tab=`.                                                          |
| `InfoSection`      | `module/dashboard/info-section.tsx`     | Bullet title left, label/value pairs right.                                                                                |
| `AccordionSection` | `module/register/accordion-section.tsx` | Long-form step: `N QUESTIONS`, big title, triangle chevron, `LOCKED` tag.                                                  |
| `Toaster`          | `ui/sonner.tsx`                         | Square dark toasts, bottom-centre.                                                                                         |

Clip-path shapes live in `globals.css` as utilities: `clip-chamfer-bl`,
`clip-tag`, `clip-avatar`. SVG outlines (team cards, brackets) are inline so
they can use `stroke-border` / `fill-background` and respond to `group-*` states.

---

## 5. Motion

**Rule: CSS first.** Reach for GSAP only when you need sequencing, scroll
coupling or text mutation.

| Interaction                    | Tech                 | Detail                                                                                      |
| ------------------------------ | -------------------- | ------------------------------------------------------------------------------------------- |
| Link bar wipe                  | CSS                  | `scale-x-0 → 100`, origin flips `right → left` on hover so it exits the other side. 200 ms. |
| Link text scramble             | GSAP `ScrambleText`  | `useScramble`; 0.5 s, `chars: "upperCase"`, `speed: 0.6`.                                   |
| Accordion open/close           | CSS                  | `Collapse`, 300 ms ease-in-out.                                                             |
| Schedule card fill             | CSS                  | `clip-path: inset(0 calc(100% - 2px) 0 0)` → `inset(0)`; text flips colour. 300 ms.         |
| Team card hover/press          | CSS                  | Tab lifts 3 px; press swaps fill to ink, scale 0.98.                                        |
| Schedule pin + sideways scroll | GSAP `ScrollTrigger` | `pin`, `scrub: 1`, `end: +=(track width + 30vh)`.                                           |
| Sponsor logo swap              | GSAP                 | Fade/scale/slide 0.25 s on active change.                                                   |
| Corner-bracket pulse           | GSAP                 | `scale: 0.98` yoyo on click.                                                                |
| Anchor navigation              | GSAP `ScrollTo`      | 0.6 s `power2.out`, `offsetY: 88`.                                                          |

All plugin registration is in `lib/gsap.ts`; import `gsap` from there.
`prefers-reduced-motion` disables scramble and smooth scroll (see
`use-scramble.ts`, `scrollToSection`, and the media query in `globals.css`).

---

## 6. Responsive behaviour

| Breakpoint | Change                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `< md`     | Frame collapses to the top bar. Content is edge to edge.                                                                      |
| `< lg`     | Nav links and CTA move into the bottom-sheet menu. Sponsors become tap-to-expand tiles. Dashboard tabs stack under the title. |
| `md`       | Full frame, rail and bottom bar appear.                                                                                       |
| `2xl`      | Container caps at 1400 px; hero scales up; "keep scrolling" hint hides.                                                       |

Schedule row height/width scale is chosen after mount (`matchMedia` in an
effect), so server and client HTML match.

---

## 7. Accessibility

- Disclosure widgets (`Faq`, sponsors, `AccordionSection`) use real `<button>`
  with `aria-expanded` / `aria-controls`; collapsed content is `inert`.
- The mobile menu is `role="dialog"`, closes on Esc / backdrop / navigation,
  locks body scroll while open.
- Text contrast: black on white. The risk is **size**: 0.5–0.7 rem labels are a
  style choice, so keep them to decorative or secondary info and never put
  required instructions in them.
- Errors use `role="alert"` + `aria-invalid`, not colour alone.
- Redacted perks carry `aria-label="redacted"`.

---

## 8. Re-skinning checklist

1. **Identity:** edit `lib/constants/site.ts`; replace `brand/logo-mark.tsx` and
   `app/icon.svg`.
2. **Fonts:** swap the three in `themes/blueprint/fonts.ts`.
3. **Colour:** edit variables in `globals.css`. Keep `foreground` far from
   `background`; the design relies on hard contrast.
4. **Content:** edit the six files in `lib/constants/`.
5. **Shape language:** want softer? change `clip-*` utilities and the SVG paths
   in `team.tsx` / `corner-brackets.tsx`, and add radius to `Button`. Do this
   everywhere or not at all.
6. **Assets:** drop images in `public/team`, `public/sponsors`, `public/photos`
   and reference them from the constants (components fall back to initials /
   names / grey frames when a path is omitted).

### Adding a landing section

1. Build it in `components/module/sections/`; start with `SectionHeader`.
2. Add `<Section id="thing">…</Section>` in `themes/blueprint/landing.tsx`.
3. Add `{ href: "/#thing", label: "THING" }` to `NAV_LINKS`.

### Adding a dashboard tab

Append to `TABS` in `app/(app)/dashboard/page.tsx`: `key`, `label`, `title`,
`subtitle`, `content`. Add `disabled: true` for a teaser tab.

---

## 9. Extension points and decisions

**Not included, and where it would plug in**

| Need                | Hook-in point                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth                | Replace `PRIMARY_CTA` with session-aware logic in `layout/navbar.tsx` (e.g. swap between REGISTER / SIGN IN / STATUS / DASHBOARD from the user's session and registration state). Guard `(app)/layout.tsx` or each page. |
| Database / API      | `register-form.tsx` `submit()`, `status/page.tsx` `status`, `dashboard/page.tsx` `DEMO_USER`.                                                                                                                            |
| File upload         | Add a field in `register-form.tsx` and an upload service of your choice.                                                                                                                                                 |
| Forms at scale      | Swap the hand-rolled validators for `react-hook-form` + `zod`.                                                                                                                                                           |
| Registration phases | `NEXT_PUBLIC_REGISTRATION=open\|closed` already drives the CTA.                                                                                                                                                          |

**Design decisions**

- **Semantic colour tokens** instead of hard-coded `black`/`white`/`zinc-*`, so
  the `.dark` class and any re-skin reach every component.
- **One scramble implementation** (`useScramble` + `ScrambleLink`) rather than
  repeating GSAP mouse handlers per link.
- **CSS for simple states.** FAQ height, team card press, schedule card fill and
  link wipes are CSS, not GSAP timelines: less code, and they survive re-renders.
- **FAQ answers are text + an optional link**, never injected HTML.
- **Schedule sizing** never reads `window` during render, so server and client
  HTML match.
- **Sponsors logo panel** is `position: sticky` and swaps the logo. Tracking
  each card's height with JS was a lot of measuring for a small effect.
- Tailwind 3 is kept on purpose (config-based tokens map directly to this
  document). Tailwind 4 would move tokens into `@theme` in CSS.

**Known limits**

- Dark mode tokens exist but have not been visually QA'd.
- Verified at 1440 px and 390 px in Chromium only; tablet widths and
  Safari/Firefox are untested.
- The pinned schedule leaves empty space under the cards while it is pinned.
