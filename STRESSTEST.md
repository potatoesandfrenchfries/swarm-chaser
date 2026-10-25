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
- **Checker B has been through three models and cannot run on the current one.** It was an OpenAI placeholder with no transport and no prices (a capped run raised). It then became Gemini 3.8 Flash, which completed six calls before it was rate limited. It is now Groq's `openai/gpt-oss-120b` ($0.15 in / $0.60 out per million tokens, `console.groq.com/docs/models`), which looks cheap and fits the "different vendor" rule (an OpenAI-trained model on a different host from Claude).
  - **Groq's limits stop it.** On this key every Groq model is limited to **8,000 tokens a minute and 200,000 a day** (`console.groq.com/docs/rate-limits`; a real call returned `413 ... TPM: Limit 8000, Requested 15542`). One check request is about 15,500 tokens, so it can never succeed, and even a smaller window would allow about one request a minute and about a dozen a day. Nothing has been judged by Groq.
  - **What is left:** the Developer tier (a billing decision), a much smaller evidence window for both checkers (which changes checker A's cache keys and probably raises the "unverifiable" share, already 6 of 10), or another second vendor. Until then the sample publishes checker A's verdicts, and `publish` accepts hand-written verdicts under their own judge name for the missing vendor.
  - Not carried over from the OpenAI plan: a reasoning level. It is not a field of `ModelSpec`, so it is neither sent nor part of the cache key, for any model. Changing it would silently reuse old answers.
  - Whether Groq's `completion_tokens` includes a reasoning model's thinking is assumed, not checked. Unverified because no Groq answer has come back.
  - **Consequence for the results:** one real checker so far. Agreement between two vendors (#35) and the 2x2 run (#32) cannot be reported from live runs yet, and the results page must say so.
- **The check stage used to lose finished work.** When checker B raised, checker A's verdicts, already paid for, were not written, because the file was only saved at the end. Each checker's verdicts are now kept as they are made, a checker that fails is stopped and recorded in `check_status.json`, and the run exits non-zero. (A rerun is free for anything already cached.)
- **The three-pound budget rules out running the whole slice.** The total is in `config.toml` `[spend]` (`cap_gbp` 3.0 at an assumed 1.25 dollars to the pound, so $3.75; the rate is not a live one). Measured on a first sample with Claude Haiku 5.5 (10 chunks, both prompts, 20 calls): $0.07 a run, about $0.0036 a call, so the whole slice (5,425 chunks) is **about $19 for one prompt**. Checking all 649 claims that sample produced with both checkers is estimated at **$11.6**, which does not fit. "Read a small sample by hand, then scale" (M3.4, M4.4) can only mean a few hundred claims at most. The results page must say how many chunks and claims were run.
- **The first estimates were low.** I assumed 2,000 output tokens a call; Haiku 5.5 averaged about 5,350 on extraction, because it thinks before it answers, so the first run cost about 2.4 times the estimate. `adapters/sample_run.py` now assumes 6,000. The check-stage figure is still a guess until a full check run is measured.
- **`max_tokens` 8,000 was too small for extraction.** Thinking took most of it and 3 of 10 prompt-e2 replies were cut off mid-JSON. A fourth had a genuine model slip (an extra `}`). Raising the extractor to 16,000 fixed all four in a rerun, at the cost of rerunning all 20 calls, because `max_tokens` is part of the cache key.
- **Extraction is very granular.** 10 chunks gave 237 claims on prompt e1 and 412 on e2 (649 in all), against 10 to 30 a chunk by eye. Almost any statement is a "claim". No claim has been read by hand yet, so whether they are checkable, or worth checking, is unknown.
- **Claim ids collided between the two prompts.** `parse_claims` built `claim_id` as `{chunk}-{i}`, so e1 and e2, which read the same chunks, gave different claims the same id. The kappa code keeps the first verdict per `claim_id` for each vendor, so it would have dropped one prompt's claim as a duplicate; the decision curve and spread are keyed the same way. The id is now `{chunk}-{extractor}-{i}`. Found by a test of the sample driver, not by reading the code.
- **A model in a provider's list may not be callable.** Google's model list shows `gemini-2.5-flash`, and a call returns 404 "no longer available to new users" and names `gemini-3.8-flash`. Prices were read from the providers' pages on 2026-10-24 and are not rechecked.
- **Gemini's thinking tokens were not counted in the spend; now they are.** `adapters/vendors.py` recorded only `candidates_token_count`, while the API reports thinking separately (`thoughts_token_count`) and bills it as output. The transport now adds the two. The six Gemini answers already in the cache (from before the fix) still carry the old, lower counts, so the spend total is off by their thinking, a few cents at most. Tested against a fake SDK only; the real count has not been compared with a bill.
- **`ModelClient` only counted its own spend, in memory.** A second process or client started again from zero, so it could not hold a total. `src/llm/budget.py` now totals what the shared cache already holds (priced from the specs, and from `[retired]` models whose answers are still cached) and gives each new client the remainder. It raises if the cache holds an answer from a model with no price, instead of counting it as free. Clients must be made one after another, because two made together would each be offered the whole remainder. The sandbox runs (about $7 a round in the `sandbox-lab` skill) do not fit in this budget at all.
- **First live verdicts (checker A, 10 claims):** 3 supported, 1 contradicted, 6 unverifiable. Nothing has been read by hand, and no second vendor has judged the same claims, so no agreement figure exists. With the claim's own row excluded and a size-capped window, "unverifiable" being the common answer is plausible, not yet understood.
- **The checker prompt is frozen, but it is still a draft.** Its hash is in `config.toml`, so a change now fails `tests/test_freeze.py` and needs a new variant name. No sample of verdicts has been read by hand (M4.4), which the pipeline rules ask for before scaling.
- **A claim's own row can still reach the window** if `Claim.row_id` is empty, which `parse_claims` leaves when the chunk carried no rows. The prompt forbids citing the claim as its own evidence, but a rule in a prompt is not a guarantee.
- **Fixed on the way:** `check_claim` used to accept `[""]` as evidence, split a bare-string evidence field into characters, crash on a non-numeric confidence, and crash on a reply that was not an object. A `supported` or `contradicted` verdict with no real quote now becomes `unverifiable`. The four known-gap tests that pinned these now pass.
