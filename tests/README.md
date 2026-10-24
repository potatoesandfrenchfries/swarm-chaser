# Tests

Everything runs offline in a few seconds: no model calls, no Docker, no dataset, no keys.

```bash
uv run pytest -q                    # the suite (hypothesis runs a random 100 examples per property)
HYPOTHESIS_PROFILE=ci uv run pytest # what CI runs: 300 fixed-seed examples, reproducible
uv run pytest --cov                 # coverage of src/ (CI requires at least 95%)
uv run ruff check src tests         # lint (CI)
```

| File | What it proves |
| --- | --- |
| `test_<module>.py` | The original per-stage happy paths (ingest, extract, check, spread, validation, headline, decision curve, forecaster, arms, page). |
| `test_edge_cases.py` | Boundaries and empty inputs: inclusive window and join edges, nothing-to-score returns NaN not an error, agent text is escaped on the page, checker input/output channels stay separate. |
| `test_properties.py` | Invariants for any input (Hypothesis): Wilson bounds and monotonicity, kappa in [-1, 1], AUC flips under inversion, base rate is the best constant Brier, chunks cover every row within the size limit, checker evidence is always a substring of the window. |
| `test_pipeline_contract.py` | Cross-stage agreements and the rules in `.claude/skills/pipeline-rules`: one verdict vocabulary, prompts ask for the keys parsers read, `src/` is stdlib-only, reads no clock, uses no unseeded random, fits nothing, calls no network. |
| `test_end_to_end.py` | A synthetic village through every stage with scripted fake models, down to the page. Asserts the MVP success criteria: every quote shown is an exact substring of the record, the 2x2 range, a rerun is byte-identical. |
| `test_repo_hygiene.py` | No `.env`, key-shaped string, dataset file or large file is tracked. |
| `test_known_gaps.py` | Defects found in `src/`, each a strict `xfail`. See below. |

## Known gaps

`test_known_gaps.py` states the *correct* behaviour for each defect and marks it
`xfail(strict=True)`. CI stays green while the defect exists. When someone fixes it, the test
starts passing, strict mode fails the run, and the fix is to delete the marker, so the test then
guards the fix. `pytest -m gaps` lists them; `-rx` (on by default) prints each reason.

## Adding a stage

Add its tests next to the stage's `test_<module>.py`, then extend `test_end_to_end.py` so the new
stage is exercised on the synthetic village. If `src/` needs a third-party package, add it to
`ALLOWED_THIRD_PARTY` in `test_pipeline_contract.py` and to the install step of the `test-fast`
job in `.github/workflows/ci.yml` in the same change.

## What these tests cannot tell you

They check the code, not the findings. Nothing here has run against a model, Docker or real
village data, so prompt quality, the real export's schema and the sandbox scenario are untested
until those stages run (see MVP.md "Implementation status"). All labels in this project are
LLM-made; the perturbation, agreement and known-failure checks in `eval/` are how that is validated.
