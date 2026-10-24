---
name: link-spread
description: Link later repeats, endorsements and corrections to a claim, with a string-match baseline (MVP M7). Use when building or evaluating the spread linker.
---

# Link spread (M7)

Code: `src/spread/linker.py` (`could_have_seen`, `baseline_link`, `model_link`, `spread_share`, `RELATIONS`). Test: `tests/test_spread.py`.

## Steps

1. Count a later message only if `could_have_seen` says the author could have read the claim. Pass `channel_members` when known.
2. `baseline_link` is the n-gram overlap baseline (4-grams, at least 2 shared). Run it on the same input as the model linker.
3. `model_link` takes a relation classifier you supply. Relations are `repeats`, `endorses`, `corrects`, `disputes`.
4. Use `spread_share(verdicts, edges, relation)` to report the repeated and corrected shares for contradicted claims against supported ones.
5. Show three documented cases: who said it, who repeated it, who corrected it, how long it lasted. Quote exactly.
6. Report whether the model linker beats the baseline. If spread is too noisy, show the three cases and the baseline and report precision honestly (MVP.md risks).

## Rules

Follow `/pipeline-rules`. The swarm-tracer and crosstalk repos have no licence: take ideas, write your own code.
