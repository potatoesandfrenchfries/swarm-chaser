# Event site template

A Next.js landing page and signed-in shell for a conference, festival or
community event, with **two swappable themes**. See **[DESIGN.md](./DESIGN.md)** (blueprint) and
**[DESIGN.railway.md](./DESIGN.railway.md)** (railway) for the design rules and
how to re-skin them.

**Stack:** Next.js (App Router) · React 19 · TypeScript · Tailwind CSS 3 · GSAP

## Run it

```bash
pnpm install
cp .env.example .env.local
pnpm dev            # http://localhost:3000
```

## Choose a theme

Set `NEXT_PUBLIC_THEME` in `.env.local` and restart (it is read at build time):

| Value                 | Look                                                                  |
| --------------------- | --------------------------------------------------------------------- |
| `blueprint` (default) | White, framed, chamfered, monospace labels                            |
| `railway`             | Dark, striped section banners, countdown, train-line schedule and FAQ |

| Script           | What it does                           |
| ---------------- | -------------------------------------- |
| `pnpm dev`       | Dev server                             |
| `pnpm build`     | Production build                       |
| `pnpm lint`      | ESLint                                 |
| `pnpm typecheck` | `tsc --noEmit`                         |
| `pnpm format`    | Prettier (with Tailwind class sorting) |

## What's in it

| Route                  | What                                                                            |
| ---------------------- | ------------------------------------------------------------------------------- |
| `/`                    | Landing: hero, pinned schedule, sponsors, team, FAQ, volunteer CTA, footer      |
| `/register`            | Two-step accordion registration form (validation, locked step)                  |
| `/status`              | Registration status card. Preview with `?state=confirmed` or `?state=declined`  |
| `/dashboard`           | Tabbed dashboard (`?tab=`): profile, sessions, resources, a disabled teaser tab |
| `/registration-closed` | Registration-closed page                                                        |

## Where to change things

Event content is data, not JSX. Edit `src/lib/constants/`:

| File            | Controls                                    |
| --------------- | ------------------------------------------- |
| `site.ts`       | Name, dates, location, credits, primary CTA |
| `navigation.ts` | Nav + social links                          |
| `schedule.ts`   | Timeline events (by ISO day + `HH:mm`)      |
| `sponsors.ts`   | Sponsors, tiers, perks (`revealed` flag)    |
| `team.ts`       | Team cards                                  |
| `faq.ts`        | FAQ entries                                 |
| `about.ts`      | About paragraphs (railway theme)            |

Colours, spacing metrics and clip-path shapes: `src/styles/globals.css`.
Fonts: `src/themes/<theme>/fonts.ts`. Theme-specific copy for the railway
landing page (countdown target, fact tiles, ribbon text, about text) is in
`site.ts` and `about.ts`.

## Structure

```
src/
├── app/
│   ├── (landing)/      navbar + footer layout, landing page
│   ├── (app)/          framed layout for register / status / dashboard
│   └── layout.tsx      metadata, toaster, applies the active theme
├── components/
│   ├── layout/         navbar (page frame), mobile menu, footer, section/container
│   ├── module/         motifs + page sections (sections/, dashboard/, register/)
│   ├── brand/          logo mark (placeholder, replace it)
│   └── ui/             button, inputs, chamfer button, toaster
├── themes/             blueprint/ + railway/ (fonts, landing, header…), index.ts registry
├── hooks/              use-scramble, use-tabs
├── lib/                constants/, gsap setup, utils
└── styles/globals.css  tokens + signature utilities
```

## Not included

Authentication, database, file uploads and email are left out so the template
stays backend-agnostic. DESIGN.md §9 lists the exact places to plug them in.
