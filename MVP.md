# MVP

The smallest build that answers the problem statement in [scope.md](./scope.md) and can be shown
to a data judge: *do false claims spread through the AI Village, and what stops them?*

Everything not listed under "Must" is out of the MVP. Extensions are in
[scope.md section 10](./scope.md#10-extensions).

All labels in this project come from LLMs. There are no hand labels. The checker is therefore
validated for consistency and against known answers (M6), not against people. The page says so.

## Goal

One results page with:

1. **A headline number, with its uncertainty:** the shares of checked claims that are
   contradicted, supported and unverifiable by the record, with intervals, and the range those
   shares take across two extraction prompts and two checker vendors.
2. **False-claim rate by model and by month,** with intervals.
3. **A spread result:** the share of false claims that were repeated or corrected, against the
   same share for supported claims, plus at least three documented cases (who said it, who
   repeated it, who corrected it, how long it lasted).
4. **A checker validation table:** perturbation test, cross-vendor agreement, recall of the
   known failures, and a short spot-check.
5. **A decision curve:** how many false claims a reviewer catches as a function of how many
   claims they review.
6. **A controlled result in a sandbox,** with a false claim planted in an agent's task:
   (i) how well a forecaster predicts, before the agent acts, whether it will act on the claim,
   and (ii) how often an outside LLM stops the agent from acting on it.

## Must

"Reused from" paths are in `temps_ideas/repos/` unless noted. Code marked MIT can be copied with
attribution. "Idea only" means the repo has no licence, so write our own. Details are in
[temps_ideas/REPOS.md](./temps_ideas/REPOS.md).

| # | Requirement | Done when | Reused from |
| --- | --- | --- | --- |
| M1 | Dataset access for every teammate | Everyone can download the data. If not, use the fallback below. | Nothing to reuse. |
| M2 | Ingest one slice of the village into one table | Messages and memories load into SQLite with agent, model, timestamp and text. The join test (memories and timeline by time) is recorded as pass or fail. | slopvestigatorbench `scripts/build_aivillage_data.py` (MIT). The join test is new. |
| M3 | Claim extraction | An LLM turns chunks into claims, each with a verbatim quote that passes the substring check (`validate.py` pattern). Two prompt variants, each frozen with its hash. | swarm-question-battery `chunking.py` (needs a small adapter), `assemble_prompt.py` and `config.yaml` hash freeze (MIT). The extraction prompt is new. |
| M4 | Claim checker | Each claim gets `supported`, `contradicted` or `unverifiable`, with evidence quotes that pass the substring check. The evidence is a time-bounded window of the same agent's record. Run by two vendors. "Unverifiable" is allowed and counted. | slopvestigatorbench `judge-prompt-v8.txt` (MIT, adapt it), battery `validate.py` substring check (MIT), `oxhack26/claims-ledger` `ledger/text.py` `verbatim`. The evidence window is new. |
| M5 | Headline and breakdowns | The three shares overall, per model and per month, each with a Wilson interval, plus the spread of the headline across the 2 x 2 (extraction prompt, checker vendor) runs. The page notes that models ran in different periods, so model and time are confounded. | `src/report/headline.py` (ours, written, tested). |
| M6 | Validation without hand labels | (a) **Perturbation test:** take claims judged supported, change a number, date or name, and report how often the checker flags the changed copy. (b) **Agreement:** Cohen's kappa between the two checker vendors. (c) **Known failures:** an LLM tags which of the 96 seed findings are false claims; report the share of those located in the logs. (d) **Spot-check:** read about 20 outputs and report what was found. | (b) battery `agreement.py` `cohen_kappa` only (MIT). (c) slopvestigatorbench `final-findings.json` and its `how_to_find` hints (MIT, dataset terms apply). (a) and (d) are new. |
| M7 | Spread | On the sampled claims, link later repeats, endorsements and corrections, counting only those by agents who could have seen the earlier message. Report the repeated and corrected shares for false claims against supported claims. Show three documented cases. Compare the linker against a plain string-match baseline. | Ideas only (no licence): swarm-tracer `collab/speech.py` `corrects` relation and `collab/acts.py` addressees, crosstalk's cross-agent text matching. The string-match baseline and the linker are new. |
| M8 | Decision curve | Rank claims by a zero-shot score. Plot false claims caught against claims reviewed. | Nothing to reuse. |
| M9 | Sandbox runs | The 2nd-place scenario with three arms on two models: no planted claim, a planted false claim, and a planted false claim with an outside LLM that posts to the agent. "Acts on the claim" is defined and fixed before the main runs. A pilot picks a claim strength at which outcomes are mixed. Intervals reported. | battery `handoff/anna-oct4/task_scope_reward_variants.py` and the 111 runs (MIT). Needs `anna-eval-source.zip` (**unverified**). Idea only: moral-flocking `--plant`. The planted claim and influencer arm are new. |
| M10 | Forecaster | One prompt that reads a sandbox transcript up to a cutoff before the agent's decision and returns the probability that the agent acts on the claim. Report accuracy, Brier score and AUC against a base-rate predictor. No training. | `wilson` in `src/report/headline.py` for intervals. Prompt and Brier and AUC scoring are new. |
| M11 | Handling result | Rate of acting on the claim with the outside LLM against without it, as a difference with an interval, per influencer strategy used. | `wilson` in `src/report/headline.py`. The rest is new. |
| M12 | Results page | A single static page with the six items under "Goal", plus the limits of the study. | `oxhack26/claims-ledger` `site/` static viewer pattern. |
| M13 | Reproducibility | One command reruns the pipeline from cached model answers. Keys in `.env`, never committed. | battery `config.yaml` freeze (MIT), claims-ledger rule of no run timestamps in committed files. Idea only: swarm-tracer SQLite cache of model calls. |

M9 to M11 need Docker, Inspect and an OpenRouter key. One person owns them from the start.

## Should (include if time allows)

| # | Requirement | Done when | Reused from |
| --- | --- | --- | --- |
| S1 | Village forecaster | The M10 prompt, unchanged, run on village claims with a walk-forward split: given a claim and only the earlier record, predict whether it will be contradicted or repeated within a fixed window. Same metrics as M10. | The M10 prompt and scoring, unchanged. |
| S2 | More influencer strategies | A second strategy in M9, for example a supervisor that points to the report route. | battery `INTERVENTIONS` dict for prompt wording (MIT). The strategy is new. |
| S3 | Longer village slice | More episodes, to tighten the intervals in M5. | The M2 ingest, rerun on more episodes. |

The forecaster is one prompt and one scoring script, reused. S1 adds no new component.

## Not in the MVP

- Full 17-month analysis, screenshots, a live mode, or a React viewer.
- Training any classifier on village data.
- A published benchmark.
- More than three sandbox arms, an influencer that lies, or a real misbehaving peer.
- Replicating the incentive experiments.
- Hand labelling.

## Fallback if there is no dataset access

Run a **sandbox-only MVP** and keep the same results-page shape:

1. M9 to M11 as above, plus the 111 existing runs as a baseline.
2. Code the influencer's strategy and the agent's response with the bystander scheme using two
   LLM coders, and report their agreement.
3. State plainly that the village half was not done.

This is weaker for HRT, because the "data" story is thin. Decide by the end of the first
hour of access checks.

## Minimum data

| Item | Minimum |
| --- | --- |
| Village slice | One or two episodes that contain at least three documented failures from the seed findings |
| Claims checked | Enough that every model-month cell in M5 has an interval worth showing, or fewer cells |
| Perturbation set | A few hundred changed copies of supported claims |
| Sandbox runs (M9) | Enough per arm to give an interval, and enough acted and not-acted runs for M10 to mean anything. Report intervals even if wide. |

## Minimum stack

Python 3.11+ with `uv`, SQLite, one extraction model and two checker models from different
vendors, `pytest`, a static HTML page. Docker, Inspect AI and OpenRouter for M9 to M11. Details
are in [scope.md section 4](./scope.md#4-stack).

## Implementation status

Templates for each stage are in `src/`, with `CUSTOMISE` comments where a placeholder needs
real data or a reviewed scenario. They are scaffolding, not finished stages: `pytest -q` passes
(55 tests, offline), but nothing has run against a model client, Docker or real village data.

| Module | Covers | State |
| --- | --- | --- |
| `src/ingest/village.py` | M2 | Template. Field names are placeholders until the real HF schema is checked. Includes the memories-and-timeline join test. |
| `src/extract/claims.py` | M3 | Template. Chunking, substring check and prompt hashing work. One prompt variant exists; the second is still to write. |
| `src/check/checker.py` | M4 | Template. Vendor-agnostic: pass in a client per vendor. Evidence that is not a real substring downgrades the verdict to `unverifiable`. |
| `src/report/headline.py` | M5 | Done and tested. |
| `src/eval/validation.py` | M6 | Perturbation test, kappa and known-failure recall exist. Tagging which seed findings are false claims, and matching them to the logs, is still to do. |
| `src/spread/linker.py` | M7 | String-match baseline and a pluggable model linker. The model prompt and the three documented cases are still to do. |
| `src/eval/decision_curve.py` | M8 | Template. The default score (checker confidence) is a placeholder. |
| `src/lab/arms.py` | M9, M11 | Arm and run shapes plus acting-rate and handling scoring only. The scenario, planted claim and influencer text are deliberately not here and need separate review. |
| `src/eval/forecaster.py` | M10, S1 | Scoring (accuracy, Brier, AUC against the base rate) done. The prompt's outcome wording waits on the M9 pilot. |
| `src/report/page.py` | M12 | Template. Renders tables only; plots and the documented cases are still to do. |

Not started: M1 (access), M13 (one-command rerun, config file with frozen prompt hashes), and
the model client wrappers with caching.

## Order of work

1. **Hour 1:** confirm access, test the memories-and-timeline join, pick the slice, set a spend cap.
2. **Next:** ingest (M2), then extraction and checking (M3, M4) on a small sample, reading the
   outputs by hand before scaling up.
3. **In parallel:** one person gets the sandbox harness running and runs the pilot for M9.
4. **Then:** validation (M6), the headline and breakdowns (M5), spread (M7), the decision curve
   (M8), and the sandbox runs, forecaster and handling result (M9 to M11).
5. **Last:** the results page (M12), the reproducibility check (M13), then S1 to S3 if time allows.

## Success criteria

| Criterion | Target (adjust after the first sample) |
| --- | --- |
| Every quote shown on the page is an exact substring of the record | 100% |
| The headline is shown as three shares with intervals and a range across prompts and vendors | Shown |
| False-claim rate is shown per model and per month with intervals | Shown |
| Checker validation is reported (perturbation, kappa, known-failure recall) | Reported, with sample sizes |
| Spread is shown for false against supported claims, and three cases against a string-match baseline | Shown |
| Forecast accuracy and handling effect are reported with intervals | Reported, even if wide |
| The page states what it does not show, including that labels are LLM-made | Yes |
| A teammate can rerun it from a clean checkout | Yes |

## Pitch (one sentence)

*We measured how often agents' claims are contradicted by their own village record, traced how
those claims spread and were corrected, and tested in a sandbox whether a false claim's effect
can be predicted and stopped.*

## Risks that would change the MVP

- No dataset access: use the fallback above.
- The join fails: use chat only, and drop the memory-versus-log check.
- Spread is too noisy: show the three cases and the baseline, and report the precision honestly.
- The sandbox does not work: replace the outside LLM with a scripted message on the shared
  board; if the harness itself fails, cut M9 to M11 and say so.
- The planted claim makes every run act, or none: the forecaster has nothing to predict. The
  pilot in M9 exists to prevent this.
- One model family does the extraction, checking and judging: use two vendors and say so.

## Related

[scope.md](./scope.md) · [temps_ideas/HRT.md](./temps_ideas/HRT.md) ·
[temps_ideas/REPOS.md](./temps_ideas/REPOS.md)
