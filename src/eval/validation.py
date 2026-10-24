"""Validate the checker without hand labels (scope.md section 5 `eval/`, MVP.md M6).

Three checks stand in for a human gold set, per scope.md section 3 "Labels (LLM-made, no hand
labelling)":
  (a) perturbation test — plant an error in a claim judged `supported`, see if it's caught
  (b) agreement — Cohen's kappa between the two checker vendors
  (c) known-failure recall — how many of the 96 seed findings the pipeline locates
(d), the ~20-output spot-check, is a manual read-through with no code of its own.

What this cannot give is a false-positive rate against real ground truth (scope.md section 3,
"What this cannot give"): a claim this pipeline wrongly calls false is never checked by a
person. Say so on the results page (M12) rather than implying these numbers are precision.
"""
import random
import re
from collections import Counter
from typing import Callable, Optional


# --- (a) perturbation test -------------------------------------------------------------

# CUSTOMISE: these patterns are a starting point for "change a number, date or name". Extend
# them once you see what real supported claims actually look like — plenty of claims have no
# number/date/name at all and can't be perturbed this way, which is fine; they're just skipped.
_NUMBER = re.compile(r"\b\d+(\.\d+)?\b")
_YEAR = re.compile(r"\b(19|20)\d{2}\b")


def perturb(quote: str, rng: random.Random) -> Optional[str]:
    """Change one number (or, failing that, one 4-digit year) in `quote`, keeping it the same
    length category of change throughout the run. Returns None if nothing perturbable was
    found, so the caller can skip that claim rather than silently perturbing nothing.
    """
    m = _NUMBER.search(quote)
    target = m or _YEAR.search(quote)
    if not target:
        return None
    old = target.group(0)
    try:
        new = str(int(float(old)) + rng.choice([-1, 1]) * rng.randint(1, 10))
    except ValueError:
        return None
    return quote[: target.start()] + new + quote[target.end() :]


def perturbation_test(
    supported_claims: list, run_checker: Callable[[object], str], seed: int = 0
) -> dict:
    """For every `supported` claim that can be perturbed, change a number and re-run the
    checker (`run_checker(claim_with_perturbed_quote) -> verdict_str`). Report the share
    caught (verdict != "supported"), which estimates how often a planted error would be
    caught — a label-free sensitivity estimate, not a false-positive rate.
    """
    rng = random.Random(seed)
    results = []
    for claim in supported_claims:
        new_quote = perturb(claim.quote, rng)
        if new_quote is None:
            continue
        perturbed = _with_quote(claim, new_quote)
        verdict = run_checker(perturbed)
        results.append(verdict != "supported")

    n = len(results)
    caught = sum(results)
    return {
        "n_perturbable": n,
        "n_caught": caught,
        "share_caught": caught / n if n else float("nan"),
    }


def _with_quote(claim, new_quote: str):
    """Shallow-copy a Claim with its quote swapped, so the real quote stays untouched."""
    from dataclasses import replace

    return replace(claim, quote=new_quote)


# --- (b) cross-vendor agreement ---------------------------------------------------------


def cohen_kappa(a: list, b: list) -> Optional[float]:
    """Cohen's kappa between two label sequences of equal length, aligned by claim.
    Adapted from `temps_ideas/repos/swarm-question-battery/src/agreement.py::cohen_kappa`
    (MIT) — same formula, generalised from one coding scheme's fields to any two label lists.
    """
    n = len(a)
    if n == 0:
        return None
    observed = sum(x == y for x, y in zip(a, b)) / n
    ca, cb = Counter(a), Counter(b)
    expected = sum(ca[k] * cb[k] for k in set(a) | set(b)) / (n * n)
    if expected == 1:
        return 1.0 if observed == 1 else 0.0  # both vendors used one label only
    return (observed - expected) / (1 - expected)


# CUSTOMISE: flagging below 0.6 as unreliable is the battery repo's own threshold, not a
# statistical rule. Pick a value you'd actually act on, and say in the write-up what
# "unreliable" means for the headline (M6 asks this to be reported, not hidden).
KAPPA_UNRELIABLE_BELOW = 0.6


def agreement_report(verdicts_a: list, verdicts_b: list) -> dict:
    """Verdicts from the two checker vendors, aligned by claim_id, as one agreement summary."""
    by_id_b = {v.claim_id: v.verdict for v in verdicts_b}
    paired = [(v.verdict, by_id_b[v.claim_id]) for v in verdicts_a if v.claim_id in by_id_b]
    a_labels = [p[0] for p in paired]
    b_labels = [p[1] for p in paired]
    agree = sum(x == y for x, y in zip(a_labels, b_labels)) / len(paired) if paired else float("nan")
    kappa = cohen_kappa(a_labels, b_labels)
    return {
        "n_paired": len(paired),
        "agreement": agree,
        "kappa": kappa,
        "unreliable": kappa is not None and kappa < KAPPA_UNRELIABLE_BELOW,
    }


# --- (c) known-failure recall -------------------------------------------------------------


def known_failure_recall(seed_findings: list[dict], located_finding_ids: set[str]) -> dict:
    """Share of the LLM-tagged false-claim seed findings the pipeline located.

    CUSTOMISE: `seed_findings` should already be filtered to the ones an LLM tagged as false
    claims (scope.md section 3: "They are not labelled by type. Tag which are false claims
    before using them as labels."); that tagging step is not implemented here, since it's a
    one-off LLM pass over `final-findings.json`'s 96 `keep`/`rewrite` entries, not a reusable
    pipeline stage. `located_finding_ids` is however your pipeline decides a finding was
    "found" — e.g. a false-claim verdict whose evidence window covers the finding's
    `behavior_dates` and `how_to_find` hint. That matching logic also isn't implemented here;
    it is genuinely new work (scope.md's REPOS.md notes this is the biggest reuse gap).
    """
    ids = {f["id"] for f in seed_findings}
    found = ids & located_finding_ids
    return {
        "n_seed_findings": len(ids),
        "n_located": len(found),
        "recall": len(found) / len(ids) if ids else float("nan"),
    }
