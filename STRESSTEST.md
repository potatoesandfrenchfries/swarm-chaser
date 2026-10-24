# Stress test: the blackbox model trained on ScaleAI/mrt

Status: exploratory, one seed, no confidence intervals. Branch `M9-blackbox-model`.

## What this is

A transfer experiment, not the real model. [`src/sandbox/blackbox.py`](src/sandbox/blackbox.py) predicts a binary outcome from nine numbers taken
from the visible transcript up to a cutoff. [`src/sandbox/mrt.py`](src/sandbox/mrt.py) trains it on
[ScaleAI/mrt](https://huggingface.co/datasets/ScaleAI/mrt) to see whether those features carry anything beyond one task.

What it does **not** test: the thing we care about. MRT's label is "the agent's hidden side task succeeded". Our sandbox label is "the agent acted on a
planted false claim". No sandbox runs exist yet (M9 runs are not done), so the transfer to our own label is untested.

## Result in one line

The features carry a weak signal inside the data they were fitted on (AUC about 0.63) and **no signal across tasks** (leave-one-task-out AUC 0.32 to 0.40,
below chance, accuracy at or barely above the base-rate predictor). On this evidence MRT should not be used to train the sandbox predictor.

## Setup

| | |
|---|---|
| Sample | 1,379 files fetched (seeded, `adapters/mrt.py`); 300 are from the computer-use folder and unusable (issue 1) |
| Unique labelled runs | 630, from 5 tasks, after dropping 449 duplicate transcripts (issue 2) |
| Positive rate | 0.475 (task range 0.02 to 0.69) |
| Model | standardised logistic regression, C=0.1, same as the whitebox `classify.py`; weights match sklearn to 3 decimals |
| Features | `FEATURES` in `blackbox.py`: message counts, verify and hedge rates, questions, tool calls, overlap with the task text, influencer flag |
| Visible to the model | user task message, agent text with `<thinking>` removed, tool outputs. The system message is dropped (it states the hidden task) |
| Never a feature | `monitoring_response`, `main_task_evaluation`, `side_task_evaluation`, the strategy folder name |
| Cutoff | a share of each transcript's messages: 0.25, 0.5, 0.75, 1.0 |

## Numbers

Pooled held-out scores. "Base" is a predictor that always gives the training-fold positive rate. Shuffled is the same pipeline on shuffled labels.

| Cutoff | Leave-one-task-out accuracy (base) | LOTO AUC | LOTO Brier (base) | Random-fold accuracy | Random-fold AUC | Random-fold Brier (base 0.249) | Shuffled acc (LOTO / random) |
|---|---|---|---|---|---|---|---|
| 0.25 | 0.406 (0.348) | 0.400 | 0.299 (0.277) | 0.613 | 0.631 | 0.235 | 0.470 / 0.457 |
| 0.50 | 0.367 (0.348) | 0.350 | 0.309 (0.277) | 0.600 | 0.630 | 0.235 | 0.503 / 0.492 |
| 0.75 | 0.357 (0.348) | 0.319 | 0.317 (0.277) | 0.590 | 0.636 | 0.236 | 0.483 / 0.479 |
| 1.00 | 0.357 (0.348) | 0.317 | 0.317 (0.277) | 0.571 | 0.630 | 0.237 | 0.508 / 0.495 |

Per task at cutoff 0.5 (n, positive rate, accuracy, AUC): american_airlines_2 (124, 0.69, 0.38, 0.51); api_key_calendar_agendas_2 (133, 0.46, 0.56, 0.56);
bank_transfer_2 (121, 0.62, 0.47, 0.61); expenditure_accounting (116, 0.02, 0.09, 0.97 on about 2 positives); spam_filter_update (136, 0.56, 0.31, 0.33).

Reading it:

- The shuffled controls sit near 0.5, so the pipeline is not leaking labels through its own mechanics.
- Random folds beat the base-rate Brier (0.235 against 0.249) and reach AUC 0.63, so the features hold something. It does **not** grow with the cutoff, so it is
  not "behaviour that builds up before the decision". It looks like a static property of the run (issue 5).
- Holding a whole task out removes the signal and flips it. Pooled AUC below 0.5 means the relation learned from other tasks is reversed, or that
  differences in base rate between tasks swamp it. I did not work out which.
- The 0.97 AUC on `expenditure_accounting` rests on about two positive runs and should be ignored.

## Issues

Ordered by how much each one limits what we can conclude.

1. **Only a third of the dataset has a label.** The 15 computer-use tasks (`task_pairs_agentcompany`) have no `side_task_evaluation`: none of the first 130 files I checked had one
   (20 of them hold only a `conversation`). The loader skips that whole folder, so the other 170 fetched files were not checked. The model card describes 17 SHADE-Arena tasks and 15 computer-use tasks, but the file listing has transcripts for only 5 under
   `task_pairs`. Everything above is 5 tasks. Cause not investigated.
2. **The same run is stored many times.** 449 of 1,079 labelled files (42%) were identical transcripts re-scored by different monitor models. They are removed by hashing the
   visible transcript. Without that, random folds would put copies of a test run in the training set. No duplicate had a conflicting label.
3. **Task is a confounder, and the sample has only five.** The positive rate runs from 0.02 (`expenditure_accounting`, where the side task almost never succeeds) to 0.69.
   Predicting each task's majority label alone gets 0.67 accuracy in-sample. Five tasks is too few to say anything about generalising across tasks.
4. **Strategy is a bigger confounder.** There are 192 strategy folders, with positive rates from 0.0 to 1.0. Predicting each strategy's majority label gets 0.865 accuracy
   in-sample (optimistic, since many strategies hold few runs). The strategy name is not a feature, but any feature correlated with how the agent was instructed will carry it.
   Agent model is skewed too: `claude-3-5-sonnet` is 367 of 630 runs.
5. **Flat across cutoffs suggests the model reads the run's style, not its progress.** AUC is 0.63 at 25% and at 100%. A predictor of an outcome should improve as it sees more.
6. **The label is not ours.** Hidden objective succeeded versus agent acted on a false claim. In MRT the agent is told to do the harmful task and does so knowingly. In our sandbox the agent
   is misled. Different mechanism, so even a good MRT score would not show the model predicts "acts on the planted claim".
7. **Domain shift to the sandbox is large and untested.** MRT is tool-use in mock environments. Several features have no meaning here: `influencer_present` is always 0 (MRT has no influencer),
   and `claim_overlap` uses the user's task message as a stand-in for a claim, which is a different quantity.
8. **Possible leakage in what the model sees is not ruled out.** The system message and `<thinking>` text are removed (in the first 300 labelled files, 22% of agent characters were thinking, in 15% of agent messages).
   But 949 visible agent messages and 1,598 tool outputs contain "secondary task", "side task", "hidden", "monitor" or "secret". Many are probably ordinary words in these tasks (an API-key task
   will say "secret"). I did not read them. Until someone does, treat any strong result as suspect.
9. **Message-fraction cutoffs depend on run length.** Transcripts range from 2 to 318 messages (median 66). A 50% cutoff is a different point in a long run than a short one, and run length may itself
   correlate with the label. The 1.0 cutoff includes the end of the run, next to the outcome.
10. **Features are a first guess.** The verify and hedge word lists and the nine features were chosen before seeing MRT, and not tuned on it. That keeps the test fair but means a better feature set is untried.
    Tool-call-only agent turns have empty text, which pulls `mean_agent_chars` down.
11. **No uncertainty reported.** One seed, no intervals, n=630 from 5 tasks. A difference of a few points in accuracy is within noise. Do not quote these as precise.
12. **The dataset card does not match the files.** The card says `transcript`, `monitor_transcript`, `monitor_verdict`. The files have `conversation`, `monitor_conversation` or none,
    `monitoring_response`, `main_task_evaluation`, `side_task_evaluation`. The card puts `attack_model` then `monitor_model` under the task; there is an extra strategy folder in between.
    Not all files have every key. The loader reads only what exists and counts what it skips.
13. **The outcome label comes from an automatic evaluation we have not inspected.** It is a boolean, not a monitor opinion, which is better than the verdict. But the card does not say how it was produced.

## Terms and rules

- **Licence:** CC BY-NC 4.0. Research use is fine; cite Kale et al. 2025, "Reliable Weak-to-Strong Monitoring of LLM Agents". Not for anything commercial.
- **Card restriction:** "should not be used to train generative models". This fits a nine-feature logistic regression and copies no text, which I read as allowed. Worth a second opinion.
- **Canary string:** the card carries one. No MRT text is in the repo; the tests use made-up files. Data lives in git-ignored `local/mrt/` (278 MB).
- **Content:** the transcripts show simulated attacks. Nothing is reproduced here, and `scope.md` section 8 still applies.
- **Pipeline rules:** M10 says "No training", and the contract test says the pipeline fits nothing on village data. This code fits on sandbox-type data only. The whitebox `classify.py` is exempted in
  `tests/test_pipeline_contract.py`, and a test stops the village stages from importing `sandbox`. `blackbox.py` and `mrt.py` pass the existing scan unchanged, but the intent behind it needs a decision.

## Reproducing

```
uv run python adapters/mrt.py local/mrt --per-task 20 --seed 0
uv run python adapters/mrt.py local/mrt --per-task 200 --seed 0 --roots task_pairs
PYTHONPATH=src uv run python -m sandbox.mrt local/mrt
```

The second fetch overwrites `local/mrt/sample.json`, so the exact first-pass file list is not recorded. The analysis reads every file present under `local/mrt/`. The upstream dataset may also change.
The unit tests (`tests/test_mrt.py`, `tests/test_blackbox.py`) use made-up files; the real-data run is not in CI.

## What would change the verdict

- Sandbox runs with the real label: train on the 111 existing battery runs or the new M9 runs, and compare with the MRT-trained model on the same held-out runs. This is the test that matters.
- Reading the flagged visible messages (issue 8) and, if some leak the side task, dropping them and rerunning.
- More SHADE-Arena tasks with labels, or a grouped split by strategy as well as by task.
- Per-run intervals (bootstrap over runs, within task) before comparing any two numbers.

## Checker (M4): what building it turned up

Added from the M4.1 and M4.3 work on branch `M4-judge-prompt`. This is not a stress-test result: nothing here has run against a live model, and no checker verdict has been read by hand yet (M4.4).

- **Evidence windows are large.** On `local/slice.sqlite`, rows average 13.5k characters and the longest is 355k (a memory). The uncapped plus-or-minus 24 h window for 40 random chat claims would have been far over any prompt. With the caps (`MAX_ROW_CHARS` 6,000; `MAX_WINDOW_CHARS` 60,000) the windows held 9 to 33 rows and stayed under 60k characters. Both numbers are first guesses; M4.4 should set them from the sample.
- **Truncation changes what can be quoted.** A cut row ends in `[TRUNCATED]`, so evidence can only come from the first 6,000 characters of any row, and a claim whose proof sits later in a long memory is judged `unverifiable`. How often that happens is not measured.
- **The join test (M2.4) has not been run.** Chat and memory rows share one table and one clock, so the window includes memories, but whether memory timestamps line up with chat has not been checked (`ingest.village.join_report` exists).
- **`ModelSpec` defaults to `temperature=0.0`.** The Claude API reference says any request with `temperature`, `top_p` or `top_k` returns a 400 from 2026-10-21. `check.run.checker_specs()` sets no temperature, but every other stage that builds a `ModelSpec` directly still sends 0.0. Not fixed, because changing the default changes every cache key.
- **Thinking counts against `max_tokens`.** Claude Sonnet 5.5 thinks by default, so a small limit can cut the JSON verdict off. Checker A is set to 8,000. A truncated reply would show up as `ReplyNotJSON`, which `run_checks(failed=[...])` records and skips; check how many appear.
- **Checker B has no transport.** `config.toml` names `openai` / `gpt-6.1-sol`, labelled through Codex. `adapters/vendors.py` has no `openai` transport, the spec has no prices (so no spend cap), and the reasoning level (high) is not part of the spec or the cache key, so changing it would silently reuse old answers.
- **A claim's own row can still reach the window** if `Claim.row_id` is empty, which `parse_claims` leaves when the chunk carried no rows. The prompt forbids citing the claim as its own evidence, but a rule in a prompt is not a guarantee.
- **Fixed on the way:** `check_claim` used to accept `[""]` as evidence, split a bare-string evidence field into characters, crash on a non-numeric confidence, and crash on a reply that was not an object. A `supported` or `contradicted` verdict with no real quote now becomes `unverifiable`. The four known-gap tests that pinned these now pass.
