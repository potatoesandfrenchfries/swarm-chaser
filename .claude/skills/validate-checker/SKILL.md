---
name: validate-checker
description: Validate the checker without hand labels (MVP M6): perturbation test, vendor agreement, known-failure recall, spot-check. Use when producing the validation table.
---

# Validate the checker (M6)

Code: `src/eval/validation.py` (`perturb`, `perturbation_test`, `cohen_kappa`, `agreement_report`, `known_failure_recall`). Test: `tests/test_validation.py`.

## Steps

1. **Perturbation:** take claims judged `supported`, change a number, date or name with `perturb`, re-run the checker, report how often the changed copy is flagged. Aim for a few hundred changed copies and report n.
2. **Agreement:** `agreement_report` on the two vendors' verdicts for the same claims. Kappa under 0.6 (`KAPPA_UNRELIABLE_BELOW`) is reported as unreliable, not hidden.
3. **Known failures:** have an LLM tag which of the 96 seed findings (`final-findings.json`, using its `how_to_find` hints) are false claims. Run `known_failure_recall` against the set of findings the pipeline located. Dataset terms apply.
4. **Spot-check:** read about 20 outputs and write down what you found. No code.
5. Hand the numbers to `report/page.py` `section_4_validation`.

## Rules

Follow `/pipeline-rules`. These numbers are not precision. There is no human ground truth, and the page must say a wrongly flagged claim is never checked by a person.
