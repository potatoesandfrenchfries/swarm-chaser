---
name: check-claims
description: Judge each claim against the same agent's time-bounded record with two checker vendors (MVP M4). Use when writing the checker prompt, wiring a vendor, or running checks.
---

# Check claims (M4)

Code: `src/check/checker.py` (`evidence_window`, `window_text`, `check_claim`, `Verdict`). Test: `tests/test_check.py`.

## Steps

1. Build the window with `claim_window(claim, rows)` (or `evidence_window(rows, ts, agent, exclude_id, episode_id)`). It is the same agent's chat and memory rows in the claim's episode within 24 hours either side (`WINDOW_*_SECONDS`), without the claim's own row, in time order, and capped at `MAX_WINDOW_CHARS` by dropping the rows farthest from the claim (`MAX_ROW_CHARS` cuts a single long row). Widen or narrow it only after reading examples.
2. Name the two checker models in `config.toml` `[checkers.a]`/`[checkers.b]` (different vendors; `checker_specs()` enforces it), give each a `ModelClient` from `src/llm/client.py` with its transport from `adapters/vendors.py`, and run `run_checks(claims, rows, client.as_caller(), judge_name=spec.label, failed=[])`. Get the call count and cost first with `client.estimate(checker_requests(claims, rows))`. (Underneath, a vendor is one `call_checker(prompt, text) -> dict`.) It returns `{"verdict", "evidence": [...], "confidence"}`. `check_claim` is vendor-agnostic.
3. Run every claim through two vendors from different families. Pass the vendor name as `judge_name`.
4. `check_claim` drops evidence quotes that are not substrings of the window and downgrades the verdict to `unverifiable` if none survive. Do not weaken that.
5. Adapt `CHECKER_PROMPT` from `slopvestigatorbench .../judge-prompt-v8.txt` (MIT). Freeze it and commit the hash.
6. Store `Verdict` rows (claim_id, verdict, evidence, judge, confidence). `report/headline.py` expects the same three verdict strings.
7. Read about 20 verdicts by hand on a small sample before scaling.

## Rules

Follow `/pipeline-rules`. The checker only sees the record, so it cannot say a claim is true of the world. That is why `unverifiable` exists.
