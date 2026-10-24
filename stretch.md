# Stretch

Work beyond the [MVP](./MVP.md), aimed at making the results page and the demo land with a judge. None of it
is needed for the Must list. Do it only after the numbers it would show exist, and cut it first if time runs
short.

MVP.md lists a React viewer and a live mode under *Not in the MVP*, and `src/report/charts.py` renders inline SVG
with no script. Anything marked "Script" below goes past that, so keep it small and keep the page static
(no server, no build step).

## What the issues already cover

Checked against issues #1 to #66 and #73 on 2026-10-24.

| Idea | Issue | What it covers |
| --- | --- | --- |
| Rates by model and month, with intervals | #55 (closed), #33 | Dot-and-whisker chart. Not a heatmap. |
| Decision curve | #45, #66 | Static plot of false claims caught against claims reviewed. No slider. |
| Spread result, false against supported | #42, #66 | Static plot. |
| Documented cases | #43, #56 | Text cases, quotes checked as exact substrings through #58. No designed visual. |
| Sandbox result with intervals | #54, #57 | "Page shows M10.2 and M11.1 with intervals". The chart form is open. |
| Forecaster | #52, #53 | Prompt and accuracy, Brier and AUC scoring only. |
| Limits and the substring-check harness | #58 | Covered. |

## Stretch items

Each is proposed as a new issue. Owners are to be assigned. Ordered by payoff.

| # | Item | Needs | Blocked by | Notes |
| --- | --- | --- | --- | --- |
| X1 | **Demo script, slides and hosted page** | Nothing new | The page itself (#12) | No issue covers presenting the work: a 2 to 3 minute demo script, slides, hosting the static page (for example GitHub Pages), and a check that it opens from a clean checkout. #60 and #61 cover rerunning the pipeline, not this. Highest priority. |
| X2 | **Headline hero block** | Nothing new | #33, #55 | One number with its interval and the 2 x 2 range, plus a one-line takeaway, as the first screen. #55 renders the shares but nothing owns the first screen. |
| X3 | **Claim-contagion replay** | Script | #42, #43 | One lane per agent, time along the x-axis, a scrubber. A false claim is a red dot; arcs show repeats; a green arc shows a correction. Play one of the three documented cases. Makes "spread" something to watch. |
| X4 | **Evidence-linked claim cards** | Nothing new | #43, #58 | Each card shows the claim, its verbatim quote in context, both vendors' verdicts and the evidence quote. Upgrades #56 and reuses the #58 quote registry, so every quote stays substring-checked. |
| X5 | **Forecaster trace and forest plot** | Script for the trace | #51, #53, #54 | A sandbox transcript beside the forecaster's probability that the agent acts on the claim, moving message by message, with and without the outside LLM. Plus a forest plot of the difference in acting rate with intervals. Only worth doing if M9 runs. |
| X6 | **Interactive decision curve** | Script | #45, #66 | A slider: review N claims, see how many false claims are caught. Add-on to the static plot. |
| X7 | **"Be the monitor" mini-game** | Script | #38 | The visitor sees a claim and the earlier record, guesses supported, contradicted or unverifiable, then sees what the checkers said. Optional. |
| X8 | **Model x month heatmap** | Nothing new | #55 | Alternative rendering of the per-model, per-month rates. Fold into #55 as a follow-up, not its own issue. The confounding note stays under it. |

## Rules for all of them

- Every number and quote on the page comes from the pipeline output. A visual never invents a case.
- Quotes are registered with the #58 harness, so they fail the test if they are not exact substrings of the record.
- Intervals stay on every rate. The sample is small and the page says how small.
- All labels are LLM-made and model and time are confounded. A stretch visual does not hide that; it sits
  next to the limits section.
- Keep the page static. A script is allowed only if it is inline or a single pinned file, and the page still
  reads correctly with it off.

## Suggested order

1. X1 and X2 first: they cost little and every judge sees them.
2. X3 or X4, whichever has real data first.
3. X5 only if the sandbox runs exist.
4. X6, X7, X8 as time allows.
