---
name: extract-claims
description: Turn village chunks into checkable claims with verbatim quotes (MVP M3). Use when writing or freezing an extraction prompt or running extraction.
---

# Extract claims (M3)

Code: `src/extract/claims.py` (`chunk_rows`, `CLAIM_PROMPT`, `freeze_hash`, `validate_quote`, `parse_claims`). Test: `tests/test_extract.py`.

## Steps

1. Chunk with `chunk_rows` (24,000 characters max, whole rows only).
2. `CLAIM_PROMPT` is variant `e1` and only a starting point. Write a genuinely different variant `e2`, not a rephrase.
3. Freeze both with `freeze_hash` and commit the hashes in a `config.yaml` before scaling past a pilot.
4. Call the model through the shared LLM wrapper (cached, with a dry-run estimate). Feed the JSON to `parse_claims`, which keeps only claims whose quote is an exact substring of the chunk and returns the dropped ones with a reason.
5. Fix the `CUSTOMISE` spots in `parse_claims`: `model` and `ts` are empty, and `agent` falls back to the chunk's first agent. Look up the row the quote came from.
6. If the export uses smart quotes and too many claims are dropped, compare normalised text (see claims-ledger `ledger/text.py::norm`).
7. Report the kept/dropped counts per prompt variant, then read about 20 claims by hand.

## Rules

Follow `/pipeline-rules`. Record `extractor` on every claim, because M5 reports the spread across prompts.
