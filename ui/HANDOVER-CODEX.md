# Handover to Codex: refine the visual language of `ui/`

**Branch:** `M12-demo-ui`. Work only on this branch. Do not create a new branch, rebase it or force-push.

**Scope:** this is a refinement, not a rebuild. The layout, the page skeleton, the data model and the behaviour are good and tested. What fails is the visual language. It reads as AI-generated:
- rounded cards everywhere and pill-shaped controls
- a dotted background
- the same 1px border on every panel
- generic dark-dashboard styling
- three typefaces used inconsistently

The goal is a deliberately art-directed **agent forensics / research instrument**. The agent network is the centrepiece, not one card among many.

## 1. Read before changing anything

1. `ui/README.md`, `ui/ARCHITECTURE.md` and `ui/DESIGN.md`. DESIGN.md is the current, partly outdated, design contract; update it as you change things.
2. The reference kit `oxhack26/frontend/`, especially `DESIGN.md` (the "blueprint" theme). Its language is the one to borrow:
   - ink on paper, hairlines, no shadows
   - chamfered (45°) corners instead of radii
   - tiny monospace labels behind a square bullet
   - indexed sections (`01`, `02`)
   - small mechanical motion: wipes, clip-path fills, text scramble
3. Run the app before touching it: `cd ui && npm run dev`, then open http://127.0.0.1:4318. Click through the landing page, Story (press Space), Compare and Data. Rehearse live with `npm run live:simulate`, then use the Live tab.

## 2. What to preserve (behaviour; do not break)

- **Model and logic, no visual changes needed:**
  - `ui/src/model/*`: event model, validation, replay derivation, metrics, graph projection
  - `ui/src/state/*`: store, URL sync, playback timer, live EventSource
  - `ui/server/*`: API, Neo4j, live tailing
  - `ui/src/lib/layout.ts`: the hub layout of the Judge, agents, Sandbox and Honeypot
- **Page structure:**
  - landing (hero, "Latest from the Judge", version tabs, network and live feed, two ranked-bar panels)
  - Story (stage, claim meter, caption, dock with timeline and chapters, inspector)
  - Compare (three columns)
  - Data (Cytoscape explorer)
- **Honesty rules:**
  - Made-up data is labelled on every screen.
  - "Live" is shown only while a stream is connected.
  - Bars are drawn to scale; a zero stays empty.
  - Status always carries a glyph and a word, never colour alone.
  - Naming: Agent 1–4, and **the Judge**; no other role names.
- **Motion semantics:**
  - Animation only renders events.
  - A seek never animates; a step or playback does.
  - Reduced motion shows the final states.
- **Accessibility:** real buttons, `aria-label`s, keyboard shortcuts (Space, ←/→, 1/2/3, Esc), visible focus.

## 3. What to redesign (styling only)

| Problem now | Direction |
| --- | --- |
| Rounded glass cards and pills (`.glass`, `.panel`, `.badge`, `.chip-btn`, `.views`, tabs, `.btn--lg`) | Square or chamfered frames. Reuse `ChamferButton` and the `clip-path` chamfer approach from `oxhack26/frontend/src/components/ui/chamfer-button.tsx`. One radius rule: 0, or a chamfer for primary actions only. |
| Dotted background on `.stage`, `.home`, `.compare` | Remove it. Use a quiet ground; for the network only, faint registration marks or `CornerBrackets` (`module/corner-brackets.tsx`) framing the stage. |
| Same border on every panel | Separate by hierarchy instead: hairline rules, indexed section headers (`SectionHeader`, `BulletLabel`), spacing. Panels should not all look like cards. |
| Three faces used loosely (Archivo, Newsreader, JetBrains Mono) | Keep **serif only for verbatim record text and the hero headline**. Interface in one sans. Mono only for small uppercase labels and ids, the blueprint "everything is a label" rule (`BulletLabel`). Set a strict type scale in `tokens.css`. |
| Network shown as a card in a card on the landing page | Make it the hero object: full-bleed band, framed with corner brackets and a mono caption ("FIG. 01: CLAIM PROPAGATION"), and the live feed set as a ledger beside it, not a second card. |
| Generic status chips and colour accents | Keep the semantic colours (claim yellow, contradicted red, correction blue, allowed green) but use them sparingly, on marks only, not fills on large areas. |
| Ranked bars look like arena.ai clones | Restyle as a forensic ledger: numbered rows (`01`), hairline tracks, mono figures. |
| Motion is fade-and-slide | Use the kit's mechanical motion: `use-scramble.ts` for counters and labels when a step lands, clip-path wipes for record-state changes, and GSAP (`lib/gsap.ts`) only if a timeline is genuinely needed. |

Whether to switch to a light "paper" ground (blueprint) or a refined dark one is your call. Pick one, document it in `ui/DESIGN.md`, and apply it everywhere. Do not mix.

## 4. Files to work in

- **Styles:** `ui/src/styles/tokens.css` (tokens first) and `ui/src/styles/app.css` (most of the change lives here).
- **Components:**
  - `ui/src/components/`: TopBar, Transport (dock), ClaimMeter, Caption, Inspector, Glyphs, Stage (node, record and gate markup only; leave the geometry and timing logic alone)
  - `ui/src/views/`: HomeView (largest visual change), ReplayView, CompareView, ExplorerView (Cytoscape style block)
- **Porting from the kit:** it is Next.js with Tailwind; `ui/` is Vite with plain CSS. Port components into `ui/src/components/kit/` as plain React and CSS (`BulletLabel`, `CornerBrackets`, `SectionHeader`, `ChamferButton`, `use-scramble`). Do not add Next or Tailwind. Add `gsap` only if you use it.

## 5. Priorities

1. **Tokens and type:** radius, surfaces, borders, type scale and fonts in `tokens.css`; remove the dotted background and the glass-card defaults.
2. **Landing page:** make the network the centrepiece; restyle the hero, tabs, feed and ledgers with the kit components.
3. **Story view:** restyle the dock, meter, inspector and caption in the same language. Keep the Stage geometry and animation logic.
4. **Compare and Data:** apply the same language; restyle the Cytoscape `style` block in `ExplorerView.tsx`.
5. **Motion pass:** meaningful, mechanical motion tied to events; check reduced motion.
6. **Update `ui/DESIGN.md`** to describe what you shipped.

## 6. Done means

- `cd ui && npm run typecheck && npm test && npm run build` passes.
- `npm run e2e` passes. **Note:** the e2e spec still expects the old shirt-stock scenario. Update `ui/e2e/replay.spec.ts` to the current scenario (customer list, Judge, Sandbox and Honeypot) without weakening what it checks.
- Screenshots reviewed at 1440×900, 1280×800 and 390×844: no overlaps, no horizontal scroll, no console errors.
- No behaviour removed. Every made-up label still visible.
- Commit on `M12-demo-ui` only when asked.
