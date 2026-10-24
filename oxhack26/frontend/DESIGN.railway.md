# Design: railway theme

A dark, colourful alternative to the default theme: a black page, bands of
four-colour stripes that change hue per section, and a train-line vocabulary
(carriages, tracks, stations, stops). Choose it with
`NEXT_PUBLIC_THEME=railway`. Shared rules (tokens, a11y, extension points) are
in [DESIGN.md](./DESIGN.md).

> **Font:** Host Grotesk from Google Fonts, one family for every role.

---

## 1. Character

1. **Black page, bright bands.** `#121212` background; colour appears only in
   stripe bands, the countdown, links and the ribbon.
2. **Four stripes = one palette.** Every colour is one of `--stripe-1`
   (lightest) to `--stripe-4` (darkest), set by the nearest `data-palette`.
3. **Each section owns a colour.** Hero warm, About blue, Sponsors green,
   Schedule pink, FAQs purple. Links, focus rings, the ribbon and the FAQ line
   all follow it.
4. **Railway language.** Carriages (tabs), tracks (stripes and curves),
   stations (FAQ rings), stops (schedule rings).
5. **Big and plain.** One bold grotesque at large sizes, tight tracking, no
   decoration besides the stripes.

---

## 2. Tokens

Set on `html[data-theme="railway"]` in `themes/railway/railway.css`
(selector is more specific than `:root`, so import order is irrelevant).

| Token                                   | Value                 | Use                                         |
| --------------------------------------- | --------------------- | ------------------------------------------- |
| `background`                            | `#121212`             | Page                                        |
| `foreground`                            | white                 | Text, active tab                            |
| `muted` / `muted-foreground`            | `#262626` / `#c9c9c9` | Secondary surfaces / text                   |
| `border`                                | `#555`                | Every hairline                              |
| `ring`                                  | amber                 | Focus                                       |
| `--font-*`                              | all → Host Grotesk    | The three type roles collapse to one family |
| `--stripe-1..4`, `--accent`, `--ribbon` | per palette           | See below                                   |

### Palettes

Apply with `data-palette="…"` on any element; descendants read the variables.

| Palette  | stripe 1 → 4                            |
| -------- | --------------------------------------- |
| `warm`   | `#fec23d` `#f26e23` `#ee320c` `#d91114` |
| `blue`   | `#bef0ff` `#6dd7fd` `#0093cb` `#005acd` |
| `green`  | `#d0ded8` `#85aa9b` `#588b76` `#18392b` |
| `pink`   | `#fdb2e7` `#fb93d7` `#ee61bd` `#f24ab8` |
| `purple` | `#ae8bd8` `#9d72b3` `#5a2675` `#391053` |

To add one: add a `[data-palette="name"]` block with `--stripe-1..4`,
`--accent`, `--accent-hover`, `--ribbon`, and add the name to `Palette` in
`section.tsx`. Keep stripe 1 light and stripe 4 dark (the countdown and
header read them in order).

---

## 3. Components (`src/themes/railway/`)

| Piece        | File                                           | How it works                                                                                                                                                                                                                                                                                                    |
| ------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripes      | `stripes.tsx`                                  | Four flat rects in a `viewBox="0 0 1 4"` SVG with `preserveAspectRatio="none"`, so one graphic fits any width/height. Rects overshoot the box to avoid hairline gaps.                                                                                                                                           |
| Track ends   | `track-end.tsx`                                | Four 30px strokes on a 400×120 box, S-curving between lanes and settling at lanes 15/45/75/105 so they join the stripes exactly. The right end is the left mirrored (`-scale-x-100`). Hidden below 930px.                                                                                                       |
| Header       | `header.tsx`                                   | Carriage row, banner (stripes + track ends + brand lockup), anchor links. Not fixed.                                                                                                                                                                                                                            |
| Carriage nav | `train-nav.tsx` + `.rw-carriage` in CSS        | A parallelogram via `clip-path`. `::before` is the border colour, `::after` is the fill inset 2px; the inner polygon is offset by `1.3px`/`3.1px` so slanted edges stay parallel to the outer ones. Last carriage is flat on the right. Scrolls sideways if cramped.                                            |
| Section      | `section.tsx`                                  | Stripe band with the title over it, then a 992px content column.                                                                                                                                                                                                                                                |
| Hero         | `hero.tsx`, `countdown.tsx`, `event-facts.tsx` | Headline, live countdown, label/value tiles.                                                                                                                                                                                                                                                                    |
| Countdown    | `countdown.tsx`                                | `useSyncExternalStore` on a 1s clock; server render is `invisible` so no hydration mismatch. Digits are coloured `--stripe-4 → 1`. Doesn't tick with reduced motion.                                                                                                                                            |
| Ribbon       | `accent-ribbon.tsx`                            | A zero-height `position: sticky; top: 0` wrapper hangs the ribbon from the viewport top. An `IntersectionObserver` on `section[data-palette]` watches a 2% strip at the top and sets `--ribbon`; the SVG fill transitions. The landing wrapper must use `overflow-x: clip`, **not** `hidden`, or sticky breaks. |
| Sponsors     | `sponsors.tsx`                                 | One row per tier (platinum → silver); logo grid on the right. No logo → name in bold.                                                                                                                                                                                                                           |
| Schedule     | `schedule.tsx`                                 | One metro line per day (`--day` = a palette stripe). Each event is a stop: ring marker, time, title, place. The line is trimmed at the first and last stop. Server-rendered, any number of days; 2 or 3 sit side by side from `md`.                                                                             |
| FAQ          | `faq.tsx`                                      | Native `<details name="faqs">` (single-open, no JS). Ring = station; the open row extends a line down through its answer and takes `--stripe-1`.                                                                                                                                                                |
| Footer       | `footer.tsx`                                   | "Made by" built from `TEAM_MEMBERS`, plus legal links.                                                                                                                                                                                                                                                          |

---

## 4. Content it reads

| Data                                                                                                | File                                      |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Name, dates, copyright, credits                                                                     | `lib/constants/site.ts`                   |
| Countdown target (`startsAt`), headline (`heroLine`), fact tiles (`facts`), ribbon lines (`ribbon`) | `lib/constants/site.ts`                   |
| About text (`**word**` highlights)                                                                  | `lib/constants/about.ts`                  |
| Sponsors, schedule, FAQ, team                                                                       | `lib/constants/*` (shared with blueprint) |

Section anchors live in `themes/railway/nav.ts` and must match the ids in
`landing.tsx` (`about`, `sponsors`, `schedule`, `faqs`).

---

## 5. Responsive behaviour

| Width      | Change                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `< 651px`  | Smaller carriages; brand text scales with `vw` (`5.4vw`, max 40px). Countdown becomes 4 equal columns with units under numbers. |
| `< 930px`  | Track ends hidden; banner is stripes + brand only.                                                                              |
| `< 640px`  | Ribbon hidden.                                                                                                                  |
| `≥ 901px`  | Countdown goes inline (number + unit).                                                                                          |
| `≥ 1280px` | Fact tiles go to three columns.                                                                                                 |

**Long event names:** the brand size is viewport-based. A name much longer than
~17 characters needs smaller clamps in `header.tsx`.

---

## 6. Accessibility

- Countdown is `role="timer"` with a spoken label; no ticking under reduced
  motion; the ribbon colour transition is disabled under reduced motion.
- Decorative SVG is `aria-hidden`; schedule rings are decorative and each
  `<time>` has an `sr-only` end time.
- Focus rings are 3px, white on the carriage nav and the palette accent
  elsewhere.
- FAQ is keyboard-accessible natively.

---

## 7. Adding a theme

1. Create `src/themes/<name>/` with `fonts.ts` (export a font class string),
   a header, footer and landing component, and any CSS scoped to
   `html[data-theme="<name>"]`.
2. Add the name to `THEME_NAMES` in `themes/config.ts`.
3. Register it in `themes/index.ts`: also set `shellClassName`,
   `mainClassName` (must clear your header on app pages) and `bleedClassName`.
4. Import its CSS in `app/layout.tsx`. Override tokens (`--background`,
   `--foreground`, `--muted`, `--border`, `--ring`) and the three `--font-*`
   roles; the register, status and dashboard pages will follow.

---

## 8. Decisions and limits

- Themes are chosen at **build time**. Runtime switching would need to ship
  both themes' components to the client; if you want it, move the choice to a
  cookie read in the root layout.
- Both themes' CSS and font definitions are bundled; only the active theme's
  fonts are applied (the other's `@font-face` rules are present but unused).
- The carriage row has no scroll arrows; it scrolls by swipe or arrow keys.
- The schedule is a templated metro line: it handles any number of days and
  events, but has no connecting curve between days.
- Verified in Chromium at 1440px and 390px only.
