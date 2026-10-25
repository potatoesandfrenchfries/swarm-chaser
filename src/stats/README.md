# Statistics

Every statistic the project reports or has scoped, whether the real sample can support it yet, and mock data
for the ones it cannot. The list itself is `catalogue.py`; this file explains it.

All labels in this project are LLM-made. None of these numbers is precision, or accuracy against truth, and the
results page must say so (`/pipeline-rules`).

## What is here

| file | what it holds |
|---|---|
| `catalogue.py` | the list below, as data, so tests can check it against the code |
| `audit.py` | measures the sample against a minimum for each statistic (counts only, no village text) |
| `mock.py` | seeded mock data with planted effects, written to git-ignored `local/mock_stats/` |
| `timeseries.py` | trend, change point and autocorrelation of the monthly share |
| `clustering.py` | agent-clustered interval, intra-cluster correlation, design effect |
| `agreement.py` | confusion matrix, per-label agreement, Gwet's AC1, Stuart-Maxwell, McNemar |
| `checker_controls.py` | control edit and net catch rate for the perturbation test |
| `cascade.py` | time to first repeat or correction: Kaplan-Meier and log-rank |
| `contrast.py` | difference of two shares with interval, Fisher test, runs needed, smallest detectable difference |
| `forecast.py` | reliability table, calibration error, Brier skill score, AUC interval |
| `maths.py` | chi-squared, normal, Fisher and binomial tails and a linear solver, in the standard library |

Standard library only, as the rest of `src/` must be (`tests/test_pipeline_contract.py`), so the fast CI job needs
no numpy. `maths.py` and the clustered trend fit were checked against scipy and statsmodels to 1e-8 or better, and
the reference values are pinned in the tests.

Tests: `tests/test_stats.py`. Each statistic is checked on whether it recovers an effect `mock.py` planted.

## Commands

```
PYTHONPATH=src uv run python -m stats.audit                                  # the real sample (local/sample_run)
PYTHONPATH=src uv run python -m stats.mock --scenario step                   # null | trend | step -> local/mock_stats
PYTHONPATH=src uv run python -m stats.audit --dir local/mock_stats
```

## Status

`wired` runs in `adapters/sample_run.py`. `built` is tested in the repo but no stage calls it. `here` is built in
this folder and tested only on mock data. `scoped` is designed, not built. Tier `mvp` is in MVP.md, `added` is
proposed here and cheap, `stretch` only if the rest is done.

| id | statistic | status | tier | where | waits on |
|---|---|---|---|---|---|
| H1 | Verdict shares with Wilson intervals, overall / per model / per month — M5 | wired | mvp | `report.headline` | cell_n |
| H2 | Range of each share across the 2x2 (extractor, judge) settings — M5 | wired | mvp | `report.headline.sensitivity` | cell_n |
| H3 | Agent-clustered bootstrap interval, intra-cluster correlation and design effect — Plain Wilson assumes independent claims; one agent's claims are not | here | added | `stats.clustering` | agents |
| K1 | Cohen's kappa between the two vendors, with bootstrap interval — M6.2 | built | mvp | `eval.validation` | paired, rare_label |
| K2 | Confusion matrix, per-label agreement, Gwet's AC1 — Kappa drops when one label dominates | here | added | `stats.agreement` | paired, rare_label |
| K3 | Stuart-Maxwell and exact McNemar: is one vendor harsher? | here | added | `stats.agreement` | paired, rare_label |
| K4 | Test-retest: the same vendor re-run, kappa against itself — A ceiling for cross-vendor kappa; needs repeat live calls and the cache bypassed, so costs budget | scoped | stretch | - | - |
| P1 | Perturbation test: share of planted number/date/name errors caught, by kind — M6.1; no stage runs it | built | mvp | `eval.validation` | perturbable |
| P2 | Wilson intervals on the catch rate, overall and by kind | here | added | `stats.checker_controls` | perturbable |
| P3 | Control edit (cosmetic, meaning-preserving) and net catch rate — A noisy checker catches errors by chance; this removes that | here | added | `stats.checker_controls` | perturbable |
| P4 | Catch rate against the size of the change; stability under evidence reordering | scoped | stretch | - | perturbable |
| R1 | Known-failure recall with Wilson interval — M6.3; needs an LLM call to tag the 96 seed findings | built | mvp | `eval.validation` | seed_findings |
| T1 | Cochran-Armitage trend in the monthly share | here | added | `stats.timeseries` | months |
| T2 | Logistic trend per month with agent-clustered errors | here | added | `stats.timeseries` | months, agents |
| T3 | Single change point in the share, permutation p-value | here | added | `stats.timeseries` | months |
| T4 | Lag-1 autocorrelation of the monthly share — Descriptive only | here | added | `stats.timeseries` | months |
| T5 | Model and month fitted together to separate the two — Needs several models active in the same months; the real slice has two disjoint periods | scoped | added | - | months |
| S1 | Share of claims repeated / endorsed, per verdict, with Wilson interval — M7; 2 edges in the sample so far | built | mvp | `spread.linker` | edges, contradicted_30 |
| S2 | Linker precision on a hand-checked sample — Needs a person to read the sample | built | mvp | `spread.linker` | edges |
| S3 | Risk difference with interval: false against supported claims repeated | here | added | `stats.contrast` | edges, contradicted_30 |
| S4 | Time to first repeat: Kaplan-Meier and log-rank, false against supported | here | added | `stats.cascade` | edges, contradicted_30 |
| S5 | Time to first correction (same machinery as S4) | here | added | `stats.cascade` | edges, contradicted_30 |
| S6 | Cascade size and depth, reproduction number — Needs edges between repeats; the linker only links a message to the original claim | scoped | stretch | - | edges |
| D1 | Decision curve: false claims caught against claims reviewed — M8 | built | mvp | `eval.decision_curve` | contradicted_10 |
| D2 | AUC and precision at the review budget for the triage score — Small: reuse eval.forecaster.auc on the zero-shot scores | scoped | added | - | contradicted_10 |
| F1 | Accuracy, Brier, AUC against the base-rate predictor — M10 | built | mvp | `eval.forecaster` | forecasts |
| F2 | Reliability table, ECE, Brier skill score, AUC bootstrap interval | here | added | `stats.forecast` | forecasts |
| L1 | Acting rate per arm with Wilson interval — M11; no runs exist yet | built | mvp | `lab.arms` | arm_runs |
| L2 | Risk difference with interval, Fisher exact test, number needed | here | added | `stats.contrast` | arm_runs |
| L3 | Runs needed per arm and the smallest difference the design could find — Read this before the main runs, not after | here | added | `stats.contrast` | arm_runs |
| C1 | Spend per false claim caught — llm.budget already totals spend; divide by the contradicted count | scoped | stretch | - | - |

## Is there enough data?

Checked on `local/sample_run` (531 claims extracted; 60 checked by both vendors, 120 verdicts) and
`local/sample.sqlite`. The minimums are rules of thumb for an interval narrow enough to read, set in
`audit.REQUIREMENTS`.

| requirement | have | need | status |
|---|---|---|---|
| checked claims in the smallest model-month cell | 1 | 30 | short |
| claims judged contradicted | 4 | 10 (30 for spread) | short |
| claims judged by both vendors | 60 | 100 | short |
| supported claims a number, date or name can be changed in | 18 | 200 | short |
| consecutive months with 30 checked claims each | 1 (3 months in all, in two separate periods) | 12 | short |
| agents | 8 | 20 | short |
| spread edges | 2 | 100 | short |
| sandbox runs per arm | 0 | 32 | none |
| forecasts | 0 | 100 | none |
| slice findings tagged as false claims | not yet tagged (21 candidates in the slice) | 20 | pending |

Only the headline shares can be reported from the real sample today, and the page must show how wide their
intervals are. Everything else is short. The sample is two episodes, 2025-06/07 and 2026-06, so there is no
series to test for a trend: the time-series statistics need either the full 17 months run through the pipeline
(`scope.md` extension 1) or the mock data below.

## Mock data

`mock.py` plants these effects, each with a known size, and returns them as `truth`:

- the false-claim share: no change (`null`), +0.10 log-odds a month (`trend`), or a +1.0 step at 2025-10 (`step`)
- an agent effect (sd 0.6 log-odds), so claims cluster by agent
- four models active in overlapping windows, so model and month are confounded as they are in the village
- a second judge that calls 15% of supported claims unverifiable, where the first does not
- false claims repeated at half the rate of others (hazard ratio 0.5), and corrected far more often
- a sandbox where acting on the planted claim falls from 60% to 25% with the outside LLM
- forecasts that rank well but are overconfident

The default is 18 months, 150 claims a month, 24 agents, both judges on every claim, 40 runs per arm and 200
forecasts, which meets every minimum in the table. Seed findings (recall) are the one thing it does not mock:
recall depends on which real findings an LLM tags, so inventing them would say nothing.

Mock rows are marked (`mock-` ids, `mock-model-*`, `mock-judge-*`) and written only under `local/mock_stats/`,
so they cannot be counted in a real result. They test the code. They say nothing about the village.

## What to do next

1. **Wire what is built** (no new statistics, but nothing in the table is real until it runs): add stages to
   `adapters/sample_run.py` for kappa (K1, K2, K3) and the perturbation test with its control (P1-P3), both on
   the cached verdicts. Perturbation needs live checker calls, so dry-run the cost first.
2. **Grow the sample before running the new statistics**: more claims checked by both vendors is the common
   blocker (paired, contradicted, perturbable). 100 paired claims and 10 contradicted is the smallest worth
   reporting for kappa.
3. **Time series needs more months**, not more claims in the same months. Run the full export through the
   pipeline, or report T1-T5 as untested and show only the per-month table.
4. **Sandbox**: run L3 before the main runs. It gives the runs per arm, and the smallest difference a smaller
   design could find.
5. **Leave scoped items scoped** (K4, P4, S6, C1) unless the above is finished.

## Cautions

- The trend, change-point and clustering statistics take one vendor's verdicts at a time (`clustering.one_judge`),
  because `headline` counts a claim once per vendor. Run them for each vendor and report both.
- Models ran in different periods, so a trend or a change point in time is also a change in model. T3 finds
  where, not why; T5 is the statistic that would separate them, and needs several models active in the same months.
- Permutation and Cochran-Armitage p-values treat claims as independent. Prefer T2 (clustered), and read its
  `n_clusters`: under about 20 the errors are not trustworthy.
- Wilson intervals on the headline shares have the same independence assumption. H3 gives the clustered interval
  and the design effect; the mock data has a design effect of about 7.
