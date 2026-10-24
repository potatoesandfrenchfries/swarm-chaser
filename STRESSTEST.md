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

Added from the M4.1 and M4.3 work on branch `M4-judge-prompt`, then from the first live checker sample (M4.4, 2026-10-24, 60 claims). The bullets under "First live sample" come from that run; the rest were written before any model had run. This is not a stress-test result, and the sample is small: 60 claims, 54 of them memory claims and 6 chat claims.

- **Evidence windows are large.** On `local/slice.sqlite`, rows average 13.5k characters and the longest is 355k (a memory). The uncapped plus-or-minus 24 h window for 40 random chat claims would have been far over any prompt. With the caps (`MAX_ROW_CHARS` 6,000; `MAX_WINDOW_CHARS` 60,000) the windows held 9 to 33 rows and stayed under 60k characters. Both numbers are first guesses; M4.4 should set them from the sample.
- **Truncation changes what can be quoted.** A cut row ends in `[TRUNCATED]`, so evidence can only come from the first 6,000 characters of any row, and a claim whose proof sits later in a long memory is judged `unverifiable`. How often that happens is not measured.
- **The join test (M2.4) passes, at the checker's window and not at 60 seconds.** Memories and chat share one clock: the median distance from a memory to the nearest chat row by the same agent is 14 s in the first episode and 332 s in the second. Within the checker's plus-or-minus 24 h window, 100% and 95.4% of memories have same-agent chat and every chat row has a memory (`join-test.json`, from `ingest.join`). The older 60 s rule (`ingest.village.join_report`) fails the second episode (88% unmatched) because a memory is written when an agent consolidates, not when it speaks. Choosing the window as the bar was a judgement made while closing #23, not a threshold from the plan.
- **`ModelSpec` defaults to `temperature=0.0`.** The Claude API reference says any request with `temperature`, `top_p` or `top_k` returns a 400 from 2026-10-21. `check.run.checker_specs()` sets no temperature, but every other stage that builds a `ModelSpec` directly still sends 0.0. Not fixed, because changing the default changes every cache key.
- **Thinking counts against `max_tokens`.** Claude Sonnet 5.5 thinks by default, so a small limit can cut the JSON verdict off. Checker A is set to 8,000. A truncated reply would show up as `ReplyNotJSON`, which `run_checks(failed=[...])` records and skips; check how many appear.
- **Checker B went from an OpenAI placeholder to Gemini 3.8 Flash, to Groq, to gpt-oss-120b on OpenRouter.** It first named `openai` / `gpt-6.1-sol`, which had no transport and no prices, so a capped run raised. Gemini 3.8 Flash worked but put the 649-claim check sample at about $21 against a $3.75 budget. Groq's gpt-oss-120b was cheap, but this key is on Groq's free tier, which allows 8,000 tokens a minute for that model, and every checker request is about 15,000 tokens, so all were refused with HTTP 413 (nothing was billed). The shipped checkers are now Claude Haiku 5.5 and gpt-oss-120b through OpenRouter. `adapters/vendors.py` keeps the `openai`, `gemini` and `groq` transports; none is used by the shipped config.
  - Not carried over from the OpenAI plan: a reasoning level. It is not a field of `ModelSpec`, so it is neither sent nor part of the cache key, for any model. Changing it would silently reuse old answers.
  - **Consequence for the results:** the budget limits how many claims the checkers can judge. With these two checkers the dry run puts the 531-claim sample at $4.11 as a worst case (every reply at the 6,000-token ceiling) against $3.10 left, so it does not fit as a ceiling. Scaling the measured cost of the 60-claim run gives about $2.3, which would fit with little margin. A full 2x2 run (#32) and the results page can only show a sample, and must say so.
- **The checker prompt is frozen, and its first live sample has been read.** Its hash is in `config.toml`, so a change fails `tests/test_freeze.py` and needs a new variant name. About 20 verdict pairs were read by hand (below). Reading found problems that are about the design more than the prompt wording.
- **A claim's own row can still reach the window** if `Claim.row_id` is empty, which `parse_claims` leaves when the chunk carried no rows. The prompt forbids citing the claim as its own evidence, but a rule in a prompt is not a guarantee.
- **Fixed on the way:** `check_claim` used to accept `[""]` as evidence, split a bare-string evidence field into characters, crash on a non-numeric confidence, and crash on a reply that was not an object. A `supported` or `contradicted` verdict with no real quote now becomes `unverifiable`. The four known-gap tests that pinned these now pass.

### First live sample (M4.4)

60 claims, spread evenly through the 531-claim extraction sample, judged by Haiku 5.5 and by gpt-oss-20b and gpt-oss-120b (OpenRouter) as checker B. Claims are 54 memory and 6 chat, so this says little about chat. All numbers are from `local/sample_run/` (git-ignored: village text is research use only).

- **Every evidence quote is real.** All 77 quotes in the Haiku and 20B verdicts were found verbatim in the same agent's rows in the slice database, none only in the claim's own row. This is an independent check on top of the pipeline's own.
- **Verdicts.** Haiku: 26 supported, 4 contradicted, 30 unverifiable. gpt-oss-20b: 21, 0, 39. gpt-oss-120b: 24, 1, 35. Half or more of the claims come back unverifiable under every checker.
- **Agreement with Haiku is moderate at best.** Cohen's kappa against Haiku is 0.33 for the 20B (95% bootstrap interval 0.12 to 0.54; agreement 39 of 60) and 0.50 for the 120B (0.29 to 0.69; agreement 44 of 60). The 120B and 20B agree with each other at 0.65. The 0.6 line in `KAPPA_UNRELIABLE_BELOW` is borrowed from another repository, not a statistical rule, and with 60 claims the interval for the 120B includes it.
- **The disagreement is about whether to commit, not about what is true.** Where both Haiku and the 120B gave a supported or contradicted verdict, they agreed on 19 of 20. The 120B said unverifiable on 8 claims Haiku called supported; Haiku said unverifiable on 5 the 120B called supported.
- **Contradictions are rare and shaky.** Haiku's 4 contradicted verdicts had confidence 0.55 to 0.9. By hand, one is probably right ("sits at a commanding 38 orders" against the same agent's "with zero orders", which the 120B also found), and the rest are a count that changed over time, a one-day date difference, and evidence about a different agent. A contradiction rate from these checkers is an upper bound at best.
- **Checker B can copy the claim.** The 20B often returns "supported" with evidence that is the claim's own sentence repeated in another row, once at confidence 0.0.
- **Memory rows echo each other, so "supported by another memory" is weak evidence.** Across 5,237 consecutive memory rows by the same agent, the later row repeats a median 85% of the earlier row's lines (25th to 75th percentile 67% to 94%). Of the 481 memory claims in the sample, 64% already appear in an earlier memory row and 85% in a later one. 56 of the 77 evidence quotes are a memory row backing a memory claim. Nothing in the pipeline separates a carried-forward line from independent confirmation, so the supported share is probably inflated. This is a design question for the headline and has not been decided.
- **Repeated memory text also threatens the intervals.** The sample has no duplicate quotes, but it covers only ten chunks. On the full slice the same assertion would be extracted from several consecutive memory snapshots, and the Wilson intervals assume independent claims.
- **Cost.** The 60-claim check cost Haiku about $0.17, gpt-oss-20b $0.02 and gpt-oss-120b $0.17. Spend on everything so far, from the cache, is $0.65 of the $3.75 budget (Haiku $0.39 including extraction, gpt-oss-120b $0.17, Gemini $0.08, gpt-oss-20b $0.02), leaving $3.10. The Groq attempt cost nothing: every request was refused.
- **`.env` format.** The first attempt to test the Groq key sourced `.env` in the shell, and the file's `KEY= value` lines (a space after the equals sign) made the shell print four keys into the session output. Keys in `.env` should have no space after `=`, and tools should read the file with `python-dotenv`, never `source` it.
