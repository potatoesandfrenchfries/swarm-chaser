# DESIGN — claim-spread replay

## Purpose

A judge opens one page and, within ten seconds, sees *a claim moving between AI agents, what it made them do, and whether checking the evidence changed what happened next.* The **replay** is the centrepiece. **Compare** and the **graph explorer** are supporting instruments that use the same events.

Audience: hackathon judges (researchers, senior engineers) on a projector, then on their own laptops. Central action: press play, watch one claim travel, stop on the check, read the original evidence.

## Audience and naming (revised 24 Oct)

The demo is pitched at someone with **no technical background**. Agents are called **Agent 1, Agent 2, …**, numbered in the order the false claim reaches them, so the story reads left to right. The only agent with its own name is **the Judge**, which checks what the agents say against the records. The monitor role is rendered as the Judge throughout.

Plain words replace jargon:
- *Made-up example* instead of "synthetic demonstration"
- *reached* instead of "exposed"
- *Steps in* instead of "intervention"
- *Story / Compare / Data* as the views

Technical provenance (basis, order, source pointer, tool call) folds under *Technical details* in the inspector. The timeline is one row of steps with named key moments; it no longer has one lane per agent.

## Landing page

The first screen is the landing page, which explains the product in one sentence: "Watch one false sentence spread through a team of AI agents." It has a short lead, two actions (*Watch the story* and *Compare the three versions*) and the made-up-example note. The hero is the product itself in miniature, a glass card holding:
1. the planted sentence, highlighted
2. Agent 1 → 4 with the claim trail
3. the Judge's check against the stock sheet

It plays one orchestrated sequence on load (≈4s): trail, then rings, then the check, then the ✕, then the strike. Under reduced motion it shows the final frame. Below the hero, three numbered steps say what happens, in plain words. The steps are numbered because they are a sequence.

## Concept: the fact-checker's marks

A claim is treated the way an editor treats a sentence under review. It is **highlighted** when it first appears. It **travels** with the highlight to everyone it reaches, gets a **red strike** when the record contradicts it, and a **blue-pencil** correction when someone fixes it. These marks are the whole visual system. They come from the subject (fact-checking), not from "AI" imagery.

Composition: a full-bleed graphite **stage** holds the agent network, which is the hero. Agents run left to right in the order the claim reaches them (a "stream" layout), so the claim visibly travels across the screen. The monitor sits below the stream; record cards sit beside the agent that first touches them, placed by a collision test. Floating glass panels sit over the stage:
- the **claim meter** on top: the claim, plain counts and the key
- the **inspector** on the right: the verbatim record
- the **dock** at the bottom: play controls, named chapter markers, and a thread scrubber with one lane per agent

An editorial **caption** in a fixed band above the dock narrates the current event in one sentence. It never covers a node.

```
┌ claim-spread   Replay  Compare  Graph          [hatched] Synthetic demonstration  run ▾ ┐
├──────────────────────────────────────────────────────────────┬──────────────────────────┤
│  stage: agents on an ellipse, records at the rim             │ inspector                │
│  trails = claims that travelled, pulse = current event       │  claim in serif + marker │
│                                                              │  evidence well (verbatim)│
│  Step 9 of 16                                                │  verdict, provenance     │
│  Monitor checks the claim against the stock sheet.  ✕ …      │  where it went           │
├──────────────────────────────────────────────────────────────┴──────────────────────────┤
│ ▶ ◀ ▶ 1×   [ lanes: one per agent, glyph per event, claim band, playhead ]   9 / 16    │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Explorations (Claude Design canvas "CLAIM-SPREAD replay directions", 24 Oct 2026)

| Direction | What it tried | Kept | Dropped |
| --- | --- | --- | --- |
| A Signal observatory | Graphite stage, agents on a ring, claim trails as highlighter strokes | The stage, the ring grammar (dashed = saw it, solid = said it, square = acted on it), the caption | Decorative orbit rings |
| B Propagation atlas | Light paper, one lane per agent, the claim as a band hopping lanes | The lane thread, now the scrubber; the serif for verbatim text | Light ground for the hero (weaker pulse contrast on a projector) |
| C Experimental instrument | Small multiples of the three conditions, event lanes, ledger | Compare view composition, the ledger, explicit n | Density as the first impression |

References studied for principles, not styling: the editorial fact-check vernacular (highlight, strike, caret), transit-map lane diagrams (git graphs, Feynman diagrams) for time-plus-hand-off, and distributed-tracing waterfalls (one row per actor, ordered spans) for the scrubber. The `graph-test` branch prototype (Observatory, Atlas, Control Room) was reviewed. Its honest-state rules are kept: fixture always labelled, Neo4j server-side and read-only, and missing evidence never shown as a contradiction.

## Graph grammar

Every mark has a meaning; shape and line carry it before colour does.

| Meaning | Node / mark | Line | Colour |
| --- | --- | --- | --- |
| Agent | circle, two-letter monogram | — | ink on graphite |
| Monitor | diamond | — | ink |
| Record (file, sheet, listing, post) | rectangle, label in mono | — | ink; planted records get a yellow top rule |
| Read | — | hairline, arrow | faint ink |
| Delegate (task hand-off, no claim) | — | double hairline | muted ink |
| Claim stated / repeated / carried in a task | — | thick highlighter trail; first statement gets a burst ring | claim yellow |
| Saw the claim (exposure) | dashed ring on the agent | — | claim yellow |
| Said the claim | solid ring | — | claim yellow |
| Acted on the claim | small filled square on the agent and on the record it changed | thin solid line | claim yellow |
| Evidence check | — | dotted probe to the record checked | ink |
| Contradicted | ✕ in a filled red disc, red strike through the claim | — | red |
| Supported | ✓ in a filled green disc | — | green |
| Unverifiable | ? in a hollow dashed circle | — | muted |
| Not checked | no mark; "not checked" in words | — | — |
| Monitor intervention | caret ^ head | dashed line | correction blue |
| Correction | caret head | solid line, blue ring on recipient | correction blue |

Rings show **exposure, not belief**: the copy says so wherever rings appear. An agent that receives a claim and acts on it gets a dashed ring plus a square, not a solid ring. Only repetition earns the solid ring. "Unverifiable" and "contradicted" never share a shape.

## Colour tokens (`src/styles/tokens.css`)

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#1C1B19` | stage and page ground (warm graphite) |
| `--bg-sunken` | `#171614` | evidence wells, transport |
| `--surface` | `#221F1C` | inspector, popovers |
| `--surface-raised` | `#2A2723` | hover, selected rows |
| `--line` | `#3A3631` | hairlines, dividers |
| `--line-strong` | `#4B463F` | node strokes, control borders |
| `--ink` | `#EDE9E0` | primary text, focus ring (13.9:1 on `--bg`) |
| `--ink-muted` | `#A39D91` | secondary text (6.4:1) |
| `--ink-faint` | `#7A746A` | inactive edges and future events only, never text alone (3.9:1) |
| `--claim` | `#F2C641` | the claim and anything carrying it; text on it is `--claim-ink` `#1C1B19` |
| `--contradicted` | `#E8553F` | contradicted marks; text uses `--contradicted-text` `#F07B67` (5.3:1) |
| `--supported` | `#7FBF9A` | supported marks and text (8.2:1) |
| `--correction` | `#6AA8F0` | interventions, corrections, their text (7.0:1) |
| `--unverifiable` | `#A39D91` | hollow "?" marks |

Status is never colour alone: every status has a glyph and a word. Selection is a 2px ink outline offset by 3px; it is never yellow, because yellow means "the claim".

**Provenance** is a pattern, not a colour: synthetic data carries a diagonal hatch swatch and the words "Synthetic demonstration" in the header and on every exported view. Recorded data carries a solid swatch and its source. Live is not offered, because no live source exists.

## Typography

- **Archivo Variable** (wdth 62–125, wght 100–900), interface. Wordmark wdth 125 / 650. Caption 32/1.15 wght 500, tracking −0.01em. Body 14/1.45. Labels 12–13. Tabular numerals for steps and counts.
- **Newsreader Variable** (optical size), verbatim record text only: claims, messages, evidence quotes. Seeing serif means "this is what was actually written". 17–25px, line-height 1.35.
- **JetBrains Mono Variable**: record ids, file names, tool calls, CSV rows. 12–13px. Never for labels.
- Self-hosted via `@fontsource-variable/*`, so the demo needs no network. Fallbacks: `system-ui`, Georgia, `ui-monospace`.
- No all-caps eyebrows. Sentence case everywhere.

## Space, layout, surfaces

- 4px base; steps 4, 8, 12, 16, 20, 24, 28, 40, 56. Page gutter 28px desktop, 16px phone.
- Desktop ≥1180px: stage fills the left, inspector 380–420px on the right, transport 132px full width.
- 900–1179px: inspector narrows to 340px; caption drops to 26px.
- <900px: inspector moves below the stage; the stage keeps a 4:3 frame; the scrubber lanes collapse to a single strip with glyphs; nav becomes a three-way segmented control.
- **Glass, not glow** (changed 24 Oct after review with the user). Floating panels are frosted glass:
  - fill `rgb(255 250 240 / 0.075 → 0.035)`
  - `blur(18px) saturate(120%)`
  - a 1px light edge and one soft drop shadow
  - radius 20px for panels, 12px for record cards, a circle for the play button

  There is **no glow anywhere**: no blurred halos on trails, no coloured ambient light, no glowing buttons or verdict cards. Heavy glow was judged to read as "made by AI". Emphasis comes from crisp strokes, a solid pulse dot with a dark outline, and the opacity of older trails receding.
- No cards inside cards. The inspector is one column of sections divided by hairlines.

## Motion (`--dur-*`, `--ease-*`)

Motion only ever renders an event that happened; the stage is still when the replay is paused.

| Token | Value | Use |
| --- | --- | --- |
| `--dur-feedback` | 120ms | hover, press |
| `--dur-reveal` | 240ms | general reveals |
| ring / badge / verdict | 320 / 280 / 300ms, `--ease-out`, from scale 0.82 / 0.6 / 0.7 with opacity; no bounce | the arrival marks |
| caption, record state, inspector | 300 / 280 / 220ms | text that changes per event |
| travel | 950ms at 1× during playback (scaled by speed); at most 600ms for a step the user pressed | pulse travels source → target; trail draws behind it |
| dwell | 2000ms at 1× | time per event during playback |
| `--ease-travel` | `cubic-bezier(0.45, 0, 0.2, 1)` | pulse: gentle start, decisive arrival |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | reveals (strong ease-out, per the emil-design-eng review) |

Sequence per event: the pulse leaves the source, the trail draws behind it, and on arrival the target's ring or the record's square appears. A check extends a dotted probe to the record. On arrival the verdict glyph pops, and a contradicted claim gets its red strike drawn across the inspector quote. Scrubbing and seeking never animate, so they show the settled state at once; stepping and playback animate the current event once.

Counters tick only on a step or playback, never on a seek. Pressable controls scale to 0.96 on press.

Reduced motion: no travel, no strike-draw. States switch instantly with a 120ms opacity cross-fade. Playback still advances, so the story still works.

## Comprehension aids (added after review)

- **Chapters**: named markers above the scrubber for the moments a judge needs: *claim first said*, *first action on it*, *checked: verdict*, *monitor steps in* or *first correction*. Clicking one jumps there.
- **Plain key** in the claim meter: reached, repeated it, acted on it, claim moving, evidence check, correction. Note: "Reached is not the same as believed."
- **Plain counts**: "agents reached, of 4 in the run", "repeats, after it was first said", "actions, taken on it".
- **Intro line** before step 1 says what to watch for.
- **Brand marks** (thesvg.org, self-hosted) appear only where they are true: the Neo4j badge, and an agent's vendor when a recorded run names its model. Synthetic agents keep monograms, because a real vendor's mark on an invented agent would imply real model behaviour.

## Interaction

- One store owns view, bundle, run, step, selection, playing and speed; it is mirrored to the URL (`?view=replay&run=…&step=9&sel=event:e09`). Switching views keeps everything.
- Keyboard: Space play/pause, ←/→ step, Home/End, `1`/`2`/`3` views, Esc clears selection. The scrubber is a real `<input type="range">` under the lanes with `aria-valuetext` naming the event.
- Selecting anything pauses playback. The inspector follows the current event until the user selects something else, then shows "Follow replay" to return.
- The stage has an equivalent DOM list (events so far) for screen readers.

## Accessibility checks

Contrast as tabulated; 44px minimum targets on transport controls; visible focus everywhere; all status glyphs have words; the stage SVG has a live `aria-label` summary; reduced motion honoured; layout reflows at 390px with no horizontal page scroll.

## Do / don't

- Do show the verbatim text in serif and the narration in sans. Never mix them.
- Do say "exposed", "repeated", "acted on" separately. Never merge them into "infected" or "believed".
- Don't animate anything that is not an event. No idle drift, no particles, no glow.
- Don't show a count without its n and its source.
- Don't show the future: the stage only draws events at or before the playhead. The scrubber shows future events faint, for navigation.
