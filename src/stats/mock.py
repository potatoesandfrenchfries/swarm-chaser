"""Mock data with planted effects, for the statistics the real sample is too small to run.

Everything here is invented. Ids start with `mock-`, models and judges are named `mock-...`, and the generator
writes only under `local/mock_stats/` (git-ignored), never `local/sample_run/`, so mock rows cannot be mistaken for
the village's or counted in a real result. The shapes match the real ones (claims and verdicts as in
`local/sample_run`, edges as `spread.linker.SpreadEdge`, runs as `lab.arms.LabRun`, forecasts as
`eval.forecaster.Prediction`) so the same code runs on both.

Each effect is planted with a known size and returned in `truth`, so a test can ask whether a statistic recovers it:
a trend or a step in the false-claim share, an agent effect, a harsher second judge, false claims repeated half as
fast and corrected more often, and a sandbox intervention that lowers acting on the planted claim. Seeded, and no
clock is read, so a rerun gives the same bytes.

    PYTHONPATH=src uv run python -m stats.mock --scenario step      # writes local/mock_stats/
"""
import argparse
import json
import random
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from math import exp, log
from pathlib import Path

from eval.forecaster import Prediction
from lab.arms import LabRun
from report.headline import verdict_records
from stats.clustering import add_agent, one_judge

OUT_DIR = Path("local/mock_stats")
FIRST_YEAR, FIRST_MONTH = 2025, 1
JUDGES = ("mock-judge-a", "mock-judge-b")
LABELS = ("supported", "contradicted", "unverifiable")
# model -> (first, last) month offset it is active, so model and time are confounded as in the village.
MODEL_WINDOWS = {"mock-model-a": (0, 8), "mock-model-b": (4, 13), "mock-model-c": (9, 17), "mock-model-d": (12, 17)}
SCENARIOS = {
    "null": {"slope": 0.0, "shift": 0.0},
    "trend": {"slope": 0.10, "shift": 0.0},  # log-odds of a false claim rise by 0.10 a month
    "step": {"slope": 0.0, "shift": 1.0},  # log-odds jump by 1.0 from `change_month`
}


def _logit(p: float) -> float:
    return log(p / (1 - p))


def _expit(x: float) -> float:
    return 1 / (1 + exp(-x))


def _stamp(month_offset: int, rng: random.Random) -> datetime:
    index = FIRST_YEAR * 12 + FIRST_MONTH - 1 + month_offset
    return datetime(index // 12, index % 12 + 1, rng.randint(1, 28), rng.randint(0, 23), rng.randint(0, 59), tzinfo=timezone.utc)


def _iso(when: datetime) -> str:
    return when.strftime("%Y-%m-%dT%H:%M:%SZ")


def mock_claims(scenario: str = "step", months: int = 18, per_month: int = 150, n_agents: int = 24, change_month: int = 9, agent_sd: float = 0.6, base_rate: float = 0.10, seed: int = 0) -> tuple[list[dict], dict]:
    """Claims (as dicts in `Claim`'s shape) over `months` consecutive months, and the truth they were drawn from.
    `truth["true_label"]` holds the label each claim "really" has; `truth["agent_effect"]` the planted agent effects."""
    rng = random.Random(f"claims-{scenario}-{seed}")
    effect = SCENARIOS[scenario]
    models = [m for m in MODEL_WINDOWS]
    agent_model = {f"mock-agent-{i:02d}": models[i % len(models)] for i in range(n_agents)}
    agent_effect = {a: rng.gauss(0, agent_sd) for a in agent_model}
    claims, true_label = [], {}
    for month in range(months):
        active = [a for a, m in agent_model.items() if MODEL_WINDOWS[m][0] <= month <= MODEL_WINDOWS[m][1]]
        for j in range(per_month):
            agent = rng.choice(active)
            n = len(claims)
            logodds = _logit(base_rate) + effect["slope"] * month + (effect["shift"] if month >= change_month else 0.0) + agent_effect[agent]
            p_false = _expit(logodds)
            label = "contradicted" if rng.random() < p_false else ("unverifiable" if rng.random() < 0.25 else "supported")
            claim_id = f"mock-{n:05d}"
            true_label[claim_id] = label
            claims.append(
                {
                    "agent": agent,
                    "checkable": True,
                    "claim_id": claim_id,
                    "claim_type": "mock",
                    "episode": "mock-episode",
                    "extractor": ("e1", "e2")[j % 2],
                    "model": agent_model[agent],
                    "quote": f"Mock claim {n}: the run finished with {rng.randint(3, 40)} tests passing on May {rng.randint(1, 28)}",
                    "row_id": f"mock-row-{n:05d}",
                    "source": "mock",
                    "ts": _iso(_stamp(month, rng)),
                }
            )
    truth = {"scenario": scenario, **effect, "change_month": change_month, "change_label": f"{FIRST_YEAR + (FIRST_MONTH - 1 + change_month) // 12:04d}-{(FIRST_MONTH - 1 + change_month) % 12 + 1:02d}", "agent_sd": agent_sd, "true_label": true_label, "agent_effect": agent_effect}
    return claims, truth


def mock_verdicts(claims: list[dict], truth: dict, check_fraction: float = 1.0, seed: int = 0) -> list[dict]:
    """Two judges' verdicts (dicts in `Verdict`'s shape, plus the claim's quote as in the real file). Judge A flips
    8% of labels at random. Judge B flips 5% and, on top, calls 15% of supported claims unverifiable: a harsher judge,
    which the marginal-homogeneity test should find and a single kappa would not name."""
    rng = random.Random(f"verdicts-{seed}")
    verdicts = []
    for c in claims:
        if rng.random() >= check_fraction:
            continue
        true = truth["true_label"][c["claim_id"]]
        for judge, noise in zip(JUDGES, (0.08, 0.05)):
            label = true
            if judge == JUDGES[1] and true == "supported" and rng.random() < 0.15:
                label = "unverifiable"
            elif rng.random() < noise:
                label = rng.choice([x for x in LABELS if x != true])
            verdicts.append({"claim_id": c["claim_id"], "confidence": round(rng.uniform(0.55, 0.99), 2), "evidence": [], "judge": judge, "quote": c["quote"], "verdict": label})
    return verdicts


def mock_edges(claims: list[dict], truth: dict, horizon_hours: float = 336.0, seed: int = 0) -> list[dict]:
    """Later repeats and corrections, as dicts in `SpreadEdge`'s shape. Repeats arrive at rate 1/72 per hour, but half
    that for contradicted claims (planted hazard ratio 0.5, false claims repeated later). 50% of contradicted claims
    get a correction after a median of 48 hours, against 3% of the rest."""
    rng = random.Random(f"edges-{seed}")
    edges = []
    for c in claims:
        false = truth["true_label"][c["claim_id"]] == "contradicted"
        start = datetime.fromisoformat(c["ts"].replace("Z", "+00:00"))
        repeat_after = rng.expovariate((1 / 72) * (0.5 if false else 1.0))
        if repeat_after <= horizon_hours:
            edges.append({"claim_id": c["claim_id"], "later_message_id": f"mock-msg-{len(edges):06d}", "relation": "repeats", "agent": "mock-agent-00", "ts": _iso(start + timedelta(hours=repeat_after))})
        if rng.random() < (0.5 if false else 0.03):
            correct_after = rng.lognormvariate(log(48), 0.8)
            if correct_after <= horizon_hours:
                edges.append({"claim_id": c["claim_id"], "later_message_id": f"mock-msg-{len(edges):06d}", "relation": "corrects", "agent": "mock-agent-01", "ts": _iso(start + timedelta(hours=correct_after))})
    return edges


LAB_RATES = {"no_plant": 0.05, "planted_claim": 0.60, "planted_claim_with_intervention": 0.25}


def mock_lab_runs(n_per_arm: int = 40, rates: dict | None = None, seed: int = 0) -> list[LabRun]:
    """Sandbox runs: acting on the planted claim happens at `rates` per arm (planted: 0.60 without the outside LLM,
    0.25 with it). Only the arm and the outcome are meaningful; the scenario itself is not modelled."""
    rng = random.Random(f"lab-{seed}")
    rates = rates or LAB_RATES
    runs = []
    for arm, rate in rates.items():
        for i in range(n_per_arm):
            runs.append(LabRun("mock-model-a", arm, 0, False, "direct" if arm.endswith("intervention") else None, f"mock-run-{arm}-{i:03d}", acted_on_claim=rng.random() < rate))
    return runs


def mock_forecasts(n: int = 200, sharpness: float = 1.6, seed: int = 0) -> list[Prediction]:
    """Forecasts that rank well but are overconfident: the true chance is `p`, the forecast is `p` pushed away from
    0.5 by `sharpness` (above 1 overconfident, 1 calibrated). A calibration check should flag it, AUC should not."""
    rng = random.Random(f"forecast-{seed}")
    out = []
    for i in range(n):
        p = min(max(rng.betavariate(2, 3), 0.02), 0.98)
        out.append(Prediction(f"mock-item-{i:04d}", _expit(sharpness * _logit(p)), rng.random() < p))
    return out


def mock_dataset(scenario: str = "step", seed: int = 0, **claim_args) -> dict:
    """Everything above for one scenario: claims, verdicts, headline-shaped records from the first judge (with agents),
    edges, lab runs, forecasts and the truth."""
    claims, truth = mock_claims(scenario, seed=seed, **claim_args)
    verdicts = mock_verdicts(claims, truth, seed=seed)
    records, _ = verdict_records(claims, verdicts)
    return {
        "claims": claims,
        "verdicts": verdicts,
        "records": one_judge(add_agent(records, claims), JUDGES[0]),  # one vendor, so each claim counts once
        "edges": mock_edges(claims, truth, seed=seed),
        "lab_runs": mock_lab_runs(seed=seed),
        "forecasts": mock_forecasts(seed=seed),
        "truth": truth,
    }


def write(data: dict, out: Path = OUT_DIR) -> None:
    out.mkdir(parents=True, exist_ok=True)
    files = {
        "claims.json": data["claims"],
        "verdicts.json": data["verdicts"],
        "edges.json": data["edges"],
        "lab_runs.json": [asdict(r) for r in data["lab_runs"]],
        "forecasts.json": [asdict(p) for p in data["forecasts"]],
        "truth.json": {k: v for k, v in data["truth"].items() if k not in ("true_label", "agent_effect")},
    }
    for name, content in files.items():
        (out / name).write_text(json.dumps(content, indent=1, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--scenario", choices=sorted(SCENARIOS), default="step")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    args = parser.parse_args()
    data = mock_dataset(args.scenario, args.seed)
    write(data, args.out)
    print(f"wrote {len(data['claims'])} mock claims, {len(data['verdicts'])} verdicts, {len(data['edges'])} edges, {len(data['lab_runs'])} runs, {len(data['forecasts'])} forecasts to {args.out}")


if __name__ == "__main__":
    main()
