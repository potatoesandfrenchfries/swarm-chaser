---
name: build-results-page
description: Assemble the single static results page from every stage's output (MVP M12) and the headline numbers (M5). Use when building or checking the page.
---

# Results page (M5, M12)

Code: `src/report/headline.py` (`wilson`, `shares`, `breakdown`, `sensitivity`, `headline`) and `src/report/page.py` (`section_1_headline` to `section_6_sandbox`, `build_page`, `write_page`, `LIMITS_NOTE`). Tests: `tests/test_headline.py`, `tests/test_page.py`.

## Steps

1. `headline(records)` takes verdict records (claim_id, model, ts, verdict, extractor, judge) and gives the three shares with Wilson intervals, per model and per month, plus the range across the 2 x 2 (extractor, judge) runs.
2. Build the six sections in order: headline, by model and month, spread, checker validation, decision curve, sandbox. Pass fixtures until real data exists, so the page shell works early.
3. Keep `LIMITS_NOTE`: models ran in different periods so model and time are confounded, and every label is LLM-made.
4. Check that every quote on the page is an exact substring of the record (target 100%).
5. Write the page with `write_page`. No JS needed. If time allows, a richer viewer should reuse the `section_*` functions rather than duplicate the assembly (the `page_sections()` named in the page.py docstring does not exist yet).
6. Check the reproducibility criterion: one command rebuilds the page from cached model answers on a clean checkout.

## Rules

Follow `/pipeline-rules`. State what the page does not show.
