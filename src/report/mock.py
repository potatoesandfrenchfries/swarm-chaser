"""Mock data for the results page (MVP M12): made up, shaped like the real stage outputs.

    PYTHONPATH=src uv run python -m report.mock mock/page_data.json [--seed N]

THIS IS NOT A RESULT. Every number is drawn from a seeded generator to show what the page will look like once
real data arrives, and to let the charts and the builder be tested before it does. The bundle says `"mock": true`
(the builder puts a banner on the page) and every documented case starts with "(mock)".

The shapes are the real ones, because the real stage functions build them: `agreement_report`,
`validation_table`, `compare_rankings`, `handling_result` and `score_forecaster`. The assumptions about what the
results will look like are in the constants below and are only that: which models were active in which months
(copied from the sample, so the model and time confound shows), how often claims come out contradicted, how
often two checkers disagree, how much a forecaster beats the base rate. Change them to test other shapes; do not
quote them.
"""
import json
import math
import random
import sys
from pathlib import Path

from check.checker import Verdict
from eval.decision_curve import compare_rankings
from eval.forecaster import Prediction, score_forecaster
from eval.validation import agreement_report, validation_table
from lab.arms import LabRun, handling_result
from report.headline import wilson

# Which models ran in which months. The real sample has the same shape: some models only in 2025, some only in
# 2026, so the by-model numbers are confounded with time.
ACTIVE = {
    "2025-06": ["claude-3-7-sonnet-20250219", "claude-opus-4-20250514", "gemini-2.5-pro", "o3-2025-04-16"],
    "2025-07": ["claude-3-7-sonnet-20250219", "claude-opus-4-20250514", "gemini-2.5-pro", "o3-2025-04-16"],
    "2026-06": ["claude-opus-4-7", "gemini-2.5-pro", "gpt-5.2-2025-12-11", "gpt-5.5"],
}
# Chance a claim from this model is contradicted by the record (before checker noise).
FALSE_RATE = {
    "claude-3-7-sonnet-20250219": 0.14,
    "claude-opus-4-20250514": 0.10,
    "claude-opus-4-7": 0.07,
    "gemini-2.5-pro": 0.18,
    "gpt-5.2-2025-12-11": 0.12,
    "gpt-5.5": 0.09,
    "o3-2025-04-16": 0.22,
}
SUPPORTED_GIVEN_NOT_FALSE = 0.38  # the rest are unverifiable, which is the biggest group in the real sample
JUDGES = ("anthropic/claude-haiku-5-5", "groq/openai/gpt-oss-120b")
# What each checker says when it does not simply read off the underlying truth; checker B calls more things false.
JUDGE_MARGINAL = {JUDGES[0]: (0.10, 0.30, 0.60), JUDGES[1]: (0.15, 0.35, 0.50)}  # contradicted, supported, unverifiable
JUDGE_READS_TRUTH = 0.75
EXTRACTOR_CLAIMS = {"e1": (6, 22), "e2": (8, 30)}  # claims per model and month; the second prompt finds more
VERDICTS = ("contradicted", "supported", "unverifiable")

# Spread: the share of claims repeated or corrected later, by verdict. False claims travel and get corrected more.
REPEATED = {"contradicted": 0.38, "supported": 0.21, "unverifiable": 0.12}
CORRECTED = {"contradicted": 0.24, "supported": 0.03, "unverifiable": 0.02}
BASELINE_FACTOR = 0.6  # the string-match baseline finds fewer links than the model linker

SANDBOX_MODELS = ("claude-haiku-5-5", "gpt-oss-120b")
ARM_RUNS = {"no_plant": 8, "planted_claim": 14, "planted_claim_with_intervention": 14}
ACT_RATE = {"no_plant": 0.0, "planted_claim": 0.62, "planted_claim_with_intervention": 0.22}


def _pick(rng: random.Random, weights: tuple) -> str:
    return rng.choices(VERDICTS, weights=weights)[0]


def _claims(rng: random.Random) -> list[dict]:
    """The claims, each with the underlying truth the mock checkers read (with noise)."""
    claims = []
    for month, models in ACTIVE.items():
        for model in models:
            for extractor, (low, high) in EXTRACTOR_CLAIMS.items():
                for i in range(rng.randint(low, high)):
                    if rng.random() < FALSE_RATE[model]:
                        truth = "contradicted"
                    else:
                        truth = "supported" if rng.random() < SUPPORTED_GIVEN_NOT_FALSE else "unverifiable"
                    ts = f"{month}-{rng.randint(1, 28):02d}T{rng.randint(0, 23):02d}:{rng.randint(0, 59):02d}:00Z"
                    claims.append({"claim_id": f"mock-{model}-{month}-{extractor}-{i}", "model": model, "ts": ts, "extractor": extractor, "truth": truth})
    return claims


def _judge(rng: random.Random, judge: str, truth: str) -> str:
    return truth if rng.random() < JUDGE_READS_TRUTH else _pick(rng, JUDGE_MARGINAL[judge])


def _share(k: int, n: int) -> dict:
    p, low, high = wilson(k, n)
    return {"k": k, "n": n, "share": p, "low": low, "high": high}


def _spread(rng: random.Random, verdicts: list[Verdict]) -> dict:
    n_by_verdict = {v: sum(x.verdict == v for x in verdicts) for v in VERDICTS}
    intervals = {}
    for relation, rate in (("repeated", REPEATED), ("corrected", CORRECTED)):
        intervals[relation] = {v: _share(sum(rng.random() < rate[v] for _ in range(n)), n) for v, n in n_by_verdict.items() if n}
    shares = {v: s["share"] for v, s in intervals["repeated"].items()}
    baseline = {v: max(0.0, s * BASELINE_FACTOR + rng.uniform(-0.03, 0.03)) for v, s in shares.items()}
    cases = [
        {"claim": "(mock) the merch store has sold 12 items so far", "who_said_it": "o3-2025-04-16", "who_repeated": "gemini-2.5-pro, claude-opus-4-20250514", "who_corrected": "claude-3-7-sonnet-20250219", "duration": "1 day, 4 hours"},
        {"claim": "(mock) the shared spreadsheet was updated with the final totals", "who_said_it": "gemini-2.5-pro", "who_repeated": "gpt-5.2-2025-12-11", "who_corrected": "nobody", "duration": "unchallenged for at least 3 days"},
        {"claim": "(mock) the deploy finished without errors", "who_said_it": "gpt-5.5", "who_repeated": "nobody", "who_corrected": "claude-opus-4-7", "duration": "42 minutes"},
    ]
    return {"shares": shares, "baseline": baseline, "intervals": intervals, "cases": cases}


def _validation(vendor_a: list[Verdict], vendor_b: list[Verdict]) -> dict:
    agreement = agreement_report(vendor_a, vendor_b)
    table = validation_table(
        {"n_caught": 41, "n_perturbable": 52},
        agreement,
        {"n_located": 7, "n_seed_findings": 11},
        {"n_read": 20, "note": "(mock) 20 outputs read; most unverifiable calls looked right, two contradicted calls looked too harsh"},
        perturbation_by_kind={"number": {"n_caught": 22, "n": 25}, "date": {"n_caught": 6, "n": 9}, "name": {"n_caught": 13, "n": 18}},
    )
    return {"table": table}


def _decision(rng: random.Random, verdicts: list[Verdict]) -> dict:
    """A zero-shot ranking that finds false claims somewhat better than chance, against the random baseline."""
    base = {"contradicted": 0.70, "unverifiable": 0.30, "supported": 0.10}
    score = {v.claim_id: base[v.verdict] + rng.uniform(-0.25, 0.25) for v in verdicts}
    comparison = compare_rankings(verdicts, {"zero-shot score": lambda v: score[v.claim_id]})
    return {"comparison": {"curves": comparison["curves"]}}  # the share caught at each budget is recomputed from the curves


def _sandbox(rng: random.Random) -> dict:
    runs, predictions = [], []
    for model in SANDBOX_MODELS:
        for arm, n in ARM_RUNS.items():
            for i in range(n):
                acted = rng.random() < ACT_RATE[arm] * (1.15 if model == SANDBOX_MODELS[0] else 0.85)
                strategy = "direct" if arm == "planted_claim_with_intervention" else None
                runs.append(LabRun(model, arm, rng.randint(0, 5), rng.random() < 0.3, strategy, f"mock/{model}/{arm}/{i}", acted_on_claim=acted))
                if arm != "no_plant":
                    probability = min(0.97, max(0.03, 0.25 + 0.45 * acted + rng.gauss(0, 0.3)))
                    predictions.append({"probability": round(probability, 4), "outcome": acted})
    forecaster = score_forecaster([Prediction(str(i), p["probability"], p["outcome"]) for i, p in enumerate(predictions)])
    return {"handling": handling_result(runs), "forecaster": forecaster, "predictions": predictions}


def _clean(value):
    """JSON-safe: NaN becomes null, tuples become lists, and numbers keep full precision."""
    if isinstance(value, dict):
        return {str(k): _clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(v) for v in value]
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def make_bundle(seed: int = 0) -> dict:
    """The whole mock bundle, in the format `report.build` reads. Same seed, same bundle."""
    rng = random.Random(seed)
    claims = _claims(rng)
    records, verdicts = [], {judge: [] for judge in JUDGES}
    for c in claims:
        for judge in JUDGES:
            verdict = _judge(rng, judge, c["truth"])
            records.append({"claim_id": c["claim_id"], "model": c["model"], "ts": c["ts"], "verdict": verdict, "extractor": c["extractor"], "judge": judge})
            verdicts[judge].append(Verdict(c["claim_id"], verdict, [], judge, 0.8))
    first = verdicts[JUDGES[0]]
    e1_first = [v for v, c in zip(first, claims) if c["extractor"] == "e1"]
    bundle = {
        "mock": True,
        "title": "claim-spread: results (mock data)",
        "seed": seed,
        "records": records,
        "spread": _spread(rng, first),
        "validation": _validation(verdicts[JUDGES[0]], verdicts[JUDGES[1]]),
        "decision": _decision(rng, e1_first),
        "sandbox": _sandbox(rng),
    }
    return _clean(bundle)


def main(argv: list[str]) -> int:
    seed = 0
    if "--seed" in argv:
        i = argv.index("--seed")
        try:
            seed = int(argv[i + 1])
        except (IndexError, ValueError):
            print("--seed needs a whole number", file=sys.stderr)
            return 2
        argv = argv[:i] + argv[i + 2 :]
    if len(argv) != 1:
        print(__doc__.split("\n\n")[0], file=sys.stderr)
        return 2
    target = Path(argv[0])
    target.parent.mkdir(parents=True, exist_ok=True)
    bundle = make_bundle(seed)
    target.write_text(json.dumps(bundle, indent=1, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")
    print(f"wrote {target} (seed {seed}): {len(bundle['records'])} verdict records, MOCK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
