---
name: build-results-page
description: Assemble the single static results page from every stage's output (MVP M12) and the headline numbers (M5). Use when building or checking the page.
---

# Results page (M5, M12)

Code: `src/report/headline.py` (`wilson`, `shares`, `breakdown`, `by_model_month`, `sensitivity`, `headline`), `src/report/charts.py` (inline SVG: `dot_whisker_svg`, `headline_svg`, `grid_svg`, `calibration_svg`), `src/report/page.py` (`section_1_headline` to `section_6_sandbox`, `unavailable_section`, `build_page`, `write_page`, `LIMITS_NOTE`) and `src/report/build.py` (the bundle builder). Tests: `tests/test_headline.py`, `tests/test_page.py`, `tests/test_charts.py`, `tests/test_build.py`.

## Steps

1. `headline(records)` takes verdict records (claim_id, model, ts, verdict, extractor, judge) and gives the three shares with Wilson intervals, per model and per month, plus the range across the 2 x 2 (extractor, judge) runs.
2. Put each stage's output in one JSON bundle (the format is in the docstring of `src/report/build.py`) and run `PYTHONPATH=src uv run python -m report.build bundle.json site/index.html`. A section with no data shows a "Not available" box that says what it needs, so the page works early. A bundle with `"mock": true` gets a banner; made-up data lives on the `M12-mock-data` branch (`python -m report.mock`) and must never be shown as a result.
3. Keep `LIMITS_NOTE`: models ran in different periods so model and time are confounded, and every label is LLM-made.
4. Check that every quote on the page is an exact substring of the record (target 100%).
5. `render(bundle)` and `write_page` do the writing. No JS needed. If time allows, a richer viewer should reuse the `section_*` functions rather than duplicate the assembly (the `page_sections()` named in the page.py docstring does not exist yet).
6. Check the reproducibility criterion: one command rebuilds the page from cached model answers on a clean checkout.

## Rules

Follow `/pipeline-rules`. State what the page does not show.
