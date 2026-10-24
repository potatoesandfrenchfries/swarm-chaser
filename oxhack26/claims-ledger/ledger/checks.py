"""Tests of a claim against a measured record. This is where your domain goes.

A check looks at one verified claim plus the records in data/records.json and
either returns a result or None (it has nothing to say about this claim). A claim
with no result is reported honestly as "Can't be checked", with a note on what
record would be needed.

The bundled check compares a percentage in a claim with a measured fraction: for
instance "100% of our power is renewable" against the share of an operator's sites
that sit on low-carbon grids. Copy it to add your own.
"""
import re
from dataclasses import dataclass, field


@dataclass
class CheckResult:
    verdict: str                 # "Holds up" | "Does not hold up" | "Holds on paper only"
    gap: float                   # 0 to 1: how far the claim runs ahead of the record
    confidence: str              # "high" | "medium" | "low"
    evidence: list[dict] = field(default_factory=list)
    explanation: str = ""


def claimed_fraction(text: str) -> float | None:
    """The largest percentage the sentence states, as a fraction (100% -> 1.0)."""
    found = [float(p) for p in re.findall(r"(\d+(?:\.\d+)?)\s?%", text)]
    return max(found) / 100 if found else None


def percent_vs_record(claim: dict, records: list[dict], tolerance: float = 0.10) -> CheckResult | None:
    """Compare a stated percentage with a measured fraction for the same owner and claim type."""
    stated = claimed_fraction(claim["text"])
    record = next((r for r in records if r["owner"] == claim["owner"] and r["claim_type"] == claim["claim_type"]), None)
    if stated is None or record is None:
        return None

    measured = record["value"]
    gap = max(0.0, stated - measured)
    ok = gap <= tolerance
    if ok:
        verdict = "Holds up"
    elif claim.get("basis") == "annual":
        # An annual match is bookkeeping: it can be true on paper while the measured record disagrees.
        verdict = "Holds on paper only"
    else:
        verdict = "Does not hold up"

    n = record.get("n", 0)
    explanation = (
        f"{claim['owner']} states {stated:.0%}. The record says {measured:.0%} ({record['label']}). "
        + ("These agree within tolerance." if ok else f"The claim runs {gap:.0%} ahead of the record.")
    )
    return CheckResult(
        verdict=verdict,
        gap=min(1.0, gap),
        confidence="high" if n >= 30 else "medium",
        evidence=[{"label": record["label"], "value": measured, "unit": record.get("unit", "fraction"), "source": record["source"]}],
        explanation=explanation,
    )


# Run in order; the first check that returns a result decides the verdict.
CHECKS = [percent_vs_record]


def run_checks(claim: dict, records: list[dict]) -> CheckResult | None:
    for check in CHECKS:
        result = check(claim, records)
        if result is not None:
            return result
    return None
