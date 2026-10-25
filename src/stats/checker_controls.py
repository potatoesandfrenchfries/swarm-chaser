"""A control for the perturbation test: how often does the checker change its mind when nothing changed?

`eval.validation.perturbation_test` reports the share of planted errors caught. A checker that is noisy would
"catch" some of them by chance, so the catch rate means little without this rate beside it. The control re-runs
the checker on a cosmetic edit that cannot change the meaning; the difference between the two rates is the part
of the catch rate that follows from the error.

Like the perturbation test, these are label-free: not a false-positive rate, and never called precision.
"""
import re
from typing import Callable

from eval.validation import _with_quote
from report.headline import wilson
from stats.contrast import risk_difference


def cosmetic_edit(quote: str) -> str:
    """The quote with whitespace collapsed and a closing full stop added or removed: same words, same meaning."""
    collapsed = re.sub(r"\s+", " ", quote).strip()
    return collapsed[:-1] if collapsed.endswith(".") else collapsed + "."


def control_edit_test(supported_claims: list, run_checker: Callable[[object], str]) -> dict:
    """Re-run the checker on the cosmetic edit of every `supported` claim. `share_flipped` is how often it no
    longer says supported."""
    n = flipped = 0
    for claim in supported_claims:
        edited = cosmetic_edit(claim.quote)
        if edited == claim.quote:
            continue
        n += 1
        flipped += run_checker(_with_quote(claim, edited)) != "supported"
    return {"n": n, "n_flipped": flipped, "share_flipped": flipped / n if n else float("nan")}


def perturbation_intervals(perturbation: dict, by_kind: dict | None = None) -> dict:
    """Wilson intervals on the catch rate overall and for each kind of change (the dicts `perturbation_test` fills)."""
    p, low, high = wilson(perturbation["n_caught"], perturbation["n_perturbable"])
    out = {"overall": {"p": p, "low": low, "high": high}}
    for kind, c in (by_kind or {}).items():
        p, low, high = wilson(c["n_caught"], c["n"])
        out[kind] = {"p": p, "low": low, "high": high, "n": c["n"]}
    return out


def net_catch(perturbation: dict, control: dict) -> dict:
    """Catch rate minus the control flip rate, with a 95% interval: the share of planted errors caught beyond what
    a cosmetic edit alone would have flipped."""
    return risk_difference(perturbation["n_caught"], perturbation["n_perturbable"], control["n_flipped"], control["n"])
