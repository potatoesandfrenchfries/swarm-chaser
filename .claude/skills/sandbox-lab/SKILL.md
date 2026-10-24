---
name: sandbox-lab
description: Sandbox arms, pilot, runs and scoring for the planted-claim experiment (MVP M9-M11). Use when defining arms, scoring runs, or building the forecaster.
---

# Sandbox lab (M9 to M11)

Code: `src/lab/arms.py` (`ARMS`, `LabRun`, `validate_run`, `acting_rate`, `handling_result`) and `src/eval/forecaster.py` (`FORECASTER_PROMPT`, `brier_score`, `auc`, `score_forecaster`). Tests: `tests/test_arms.py`, `tests/test_forecaster.py`.

## Steps

1. Arms: `no_plant`, `planted_claim`, `planted_claim_with_intervention`. Run two models. Needs Docker, Inspect and an OpenRouter key, plus `anna-eval-source.zip` from the battery repo (unverified).
2. Define "acts on the claim" and write it down **before** the main runs. Set `acted_on_claim` from that definition only.
3. Run a pilot to pick a claim strength where outcomes are mixed, then set `PLANTED_CLAIM_STRENGTH`. If every run acts, or none does, the forecaster has nothing to predict.
4. Run `validate_run` on every run before pooling. Use `acting_rate` and `handling_result`, with Wilson intervals from `report.headline.wilson`.
5. Forecaster (M10): one prompt that reads the transcript up to a cutoff before the decision and returns a probability. Report accuracy, Brier score and AUC against `base_rate_predictor`. No training. S1 reuses the same prompt on village claims.
6. About $7 per round of 28 runs. Set a spend cap, do a dry run, and get the user's approval first.

## Rules

Follow `/pipeline-rules`. Describe behaviour and incentives only. Keep scenario text and influencer messages in separate task files that a person reviews, not in `src/lab/arms.py`, and do not write exploit steps (scope.md sections 1 and 8).
