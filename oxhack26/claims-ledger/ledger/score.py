"""Score each verified claim. Every number comes from code, never from a model.

Two separate outputs per claim, because they answer different questions:
  likelihood  how likely the sentence is to leave a reader with a false impression (0 to 1)
  confidence  how much public record there was to test it with (high / medium / low)

Likelihood is a weighted sum of plain, named features of the sentence (see
data/scoring.json) plus, when a check in checks.py finds a record, how far the
claim runs ahead of it. The weights are written into the output so anyone can
argue with them, and the parts of each score are shown, not just the total.
"""
import json
import re

from .checks import run_checks
from .paths import Paths


def load_scoring(paths: Paths) -> dict:
    scoring = json.loads(paths.scoring.read_text())
    total = sum(f["weight"] for f in scoring["features"]) + scoring["evidence_gap_weight"]
    if total > 1.0 + 1e-9:
        raise ValueError(f"scoring weights sum to {total:.2f}; they must not exceed 1.0 or the score leaves 0 to 1")
    return scoring


def feature_value(feature: dict, text: str) -> float:
    """0 to 1: how strongly this feature shows in the sentence."""
    low = text.lower()
    hits = len(re.findall(feature["pattern"], low, re.I))
    if feature["kind"] == "present":        # 1 if the pattern appears
        return 1.0 if hits else 0.0
    if feature["kind"] == "absent":         # 1 if the pattern is missing
        return 0.0 if hits else 1.0
    if feature["kind"] == "count":          # grows with each hit, capped
        return min(1.0, hits / feature.get("saturate", 2))
    raise ValueError(f"unknown feature kind {feature['kind']!r}")


def score(paths: Paths) -> list[dict]:
    scoring = load_scoring(paths)
    claims = json.loads(paths.claims.read_text())
    records = json.loads(paths.records.read_text())["records"] if paths.records.exists() else []

    receipts = []
    for claim in claims:
        parts = {f["name"]: feature_value(f, claim["text"]) for f in scoring["features"]}
        if claim.get("target_year"):
            parts["future_target"] = 1.0  # a stated target year is a promise, even when the wording hides it

        result = run_checks(claim, records)
        parts["evidence_gap"] = result.gap if result else 0.0

        weights = {f["name"]: f["weight"] for f in scoring["features"]} | {"evidence_gap": scoring["evidence_gap_weight"]}
        weighted = {name: round(weights.get(name, 0) * value, 3) for name, value in parts.items()}
        total = round(sum(weighted.values()), 2)

        if result:
            verdict, confidence, evidence, explanation = result.verdict, result.confidence, result.evidence, result.explanation
        else:
            verdict, confidence, evidence = "Can't be checked", "low", []
            needed = scoring["needed_by_type"].get(claim["claim_type"], scoring["needed_default"])
            explanation = f"No record in data/records.json tests this. What would be needed: {needed}."

        receipts.append({
            "claim_id": claim["id"], "verdict": verdict, "score": total, "confidence": confidence,
            "evidence": evidence, "explanation": explanation, "score_parts": weighted,
        })

    paths.out.mkdir(parents=True, exist_ok=True)
    weights_out = {f["name"]: f["weight"] for f in scoring["features"]} | {"evidence_gap": scoring["evidence_gap_weight"]}
    paths.receipts.write_text(json.dumps({"weights": weights_out, "receipts": receipts}, indent=1))
    return receipts
