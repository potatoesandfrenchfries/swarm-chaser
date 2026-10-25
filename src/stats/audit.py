"""Is there enough data for each statistic? Counts only; no village text is printed.

    PYTHONPATH=src uv run python -m stats.audit                              # the real sample in local/sample_run
    PYTHONPATH=src uv run python -m stats.mock && PYTHONPATH=src uv run python -m stats.audit --dir local/mock_stats

Each requirement is a quantity measured on the sample, a minimum, and the reason for the minimum. The minimums
are rules of thumb for an interval narrow enough to read, not statistical guarantees; change one here and the
table follows. A requirement the sample misses blocks the statistics that name it in `catalogue.CATALOGUE`.
"""
import argparse
import json
import random
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from eval.validation import perturb
from report.headline import verdict_records
from stats.catalogue import CATALOGUE
from stats.clustering import add_agent, one_judge
from stats.contrast import required_n_per_arm
from stats.timeseries import longest_run, monthly_series

SAMPLE_DIR = Path("local/sample_run")
SAMPLE_DB = Path("local/sample.sqlite")
ARM_RUNS = required_n_per_arm(0.60, 0.25)  # to tell 60% acting from 25% at 5% significance and 80% power


@dataclass(frozen=True)
class Requirement:
    id: str
    quantity: str
    need: int
    rule: str


REQUIREMENTS = [
    Requirement("cell_n", "min_cell_n", 30, "every model-month cell holds 30 checked claims, so a share's Wilson interval is under about +-17 points"),
    Requirement("contradicted_10", "contradicted_claims", 10, "10 claims judged contradicted: below this the share, kappa on that label and the decision curve are noise"),
    Requirement("contradicted_30", "contradicted_claims", 30, "30 contradicted claims, to compare how fast they spread with supported ones"),
    Requirement("paired", "paired_claims", 100, "100 claims judged by both vendors for kappa with an interval under about +-0.15"),
    Requirement("rare_label", "either_contradicted", 10, "at least 10 claims one vendor calls contradicted, so agreement on the rare label means something"),
    Requirement("perturbable", "perturbable_supported", 200, "validate-checker asks for a few hundred changed copies"),
    Requirement("months", "run_months_30", 12, "12 consecutive months each with 30 checked claims, for a trend or a change point"),
    Requirement("agents", "agents", 20, "20 agents, the least for cluster-robust errors to be trusted"),
    Requirement("edges", "edges", 100, "100 spread edges"),
    Requirement("arm_runs", "min_arm_runs", ARM_RUNS, f"{ARM_RUNS} runs in each arm, to tell 60% acting from 25%"),
    Requirement("forecasts", "forecasts", 100, "100 forecasts, so five calibration bins hold about 20 each"),
    Requirement("seed_findings", "tagged_slice_findings", 20, "20 slice findings an LLM has tagged as false claims, for recall with a usable interval"),
]


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def measure(claims: list[dict], verdicts: list[dict], n_edges: int, n_arm_runs: list[int], n_forecasts: int, tagged_findings: int | None = None, seed: int = 0) -> dict:
    """The quantity behind each requirement, from claims, verdicts and what else exists. Verdicts are the live
    vendors' only; hand-written ones would count a claim twice."""
    records, _ = verdict_records(claims, verdicts)
    records = add_agent(records, claims)
    judges = sorted({r["judge"] for r in records})
    by_id = {c["claim_id"]: c for c in claims}
    checked = {r["claim_id"] for r in records}

    by_judge: dict[str, dict[str, str]] = {}
    for r in records:
        by_judge.setdefault(r["judge"], {}).setdefault(r["claim_id"], r["verdict"])
    paired = set.intersection(*(set(v) for v in by_judge.values())) if len(by_judge) > 1 else set()
    contradicted = {cid for v in by_judge.values() for cid, x in v.items() if x == "contradicted"}
    supported = {cid for v in by_judge.values() for cid, x in v.items() if x == "supported"}

    rng = random.Random(seed)
    names = tuple(sorted({c["agent"] for c in claims}))
    perturbable = sum(perturb(by_id[cid]["quote"], rng, names) is not None for cid in sorted(supported))

    cells: dict[tuple, int] = {}
    for r in records:
        if r["judge"] == judges[0]:
            cells[(r["model"], r["ts"][:7])] = cells.get((r["model"], r["ts"][:7]), 0) + 1
    series = monthly_series(one_judge(records, judges[0])) if judges else []
    return {
        "claims_extracted": len(claims),
        "claims_checked": len(checked),
        "judges": judges,
        "min_cell_n": min(cells.values()) if cells else 0,
        "n_cells": len(cells),
        "contradicted_claims": len(contradicted),
        "paired_claims": len(paired),
        "either_contradicted": len(contradicted),
        "perturbable_supported": perturbable,
        "run_months_30": longest_run(series, 30),
        "months_with_checked_claims": sum(1 for _, _, n in series if n),
        "agents": len({by_id[cid]["agent"] for cid in checked}),
        "edges": n_edges,
        "min_arm_runs": min(n_arm_runs) if n_arm_runs else 0,
        "forecasts": n_forecasts,
        "tagged_slice_findings": tagged_findings,
    }


def audit(measured: dict) -> list[dict]:
    """One row per requirement: what the sample has, what it needs, and `enough`, `short`, `none` or `pending`
    (not measurable yet)."""
    rows = []
    for req in REQUIREMENTS:
        have = measured.get(req.quantity)
        if have is None:
            status = "pending"
        else:
            status = "enough" if have >= req.need else ("none" if have == 0 else "short")
        rows.append({"id": req.id, "have": have, "need": req.need, "status": status, "rule": req.rule})
    return rows


def blocked(rows: list[dict]) -> dict[str, list[str]]:
    """statistic id -> the requirements it is waiting on, for every statistic the sample cannot yet support."""
    bad = {r["id"] for r in rows if r["status"] != "enough"}
    return {s.id: [n for n in s.needs if n in bad] for s in CATALOGUE if any(n in bad for n in s.needs)}


def load(directory: Path, db: Path | None) -> dict:
    claims, verdicts = _read(directory / "claims.json"), _read(directory / "verdicts.json")
    if claims is None or verdicts is None:
        raise SystemExit(f"need {directory / 'claims.json'} and {directory / 'verdicts.json'}")
    edges = _read(directory / "edges.json")
    n_edges = len(edges) if edges is not None else 0
    if edges is None and db and db.exists():
        n_edges = sqlite3.connect(db).execute("select count(*) from spread_edges").fetchone()[0]
    runs = _read(directory / "lab_runs.json") or []
    arms: dict[str, int] = {}
    for r in runs:
        arms[r["arm"]] = arms.get(r["arm"], 0) + 1
    return measure(claims, verdicts, n_edges, list(arms.values()), len(_read(directory / "forecasts.json") or []))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--dir", type=Path, default=SAMPLE_DIR)
    parser.add_argument("--db", type=Path, default=SAMPLE_DB)
    args = parser.parse_args()
    measured = load(args.dir, args.db)
    print(f"{args.dir}: {measured['claims_extracted']} claims extracted, {measured['claims_checked']} checked by {', '.join(measured['judges'])}")
    print(f"months with checked claims: {measured['months_with_checked_claims']}; model-month cells: {measured['n_cells']}\n")
    rows = audit(measured)
    for r in rows:
        have = "-" if r["have"] is None else r["have"]
        print(f"{r['status']:<8} {r['id']:<16} have {have!s:>5} / need {r['need']:<4} {r['rule']}")
    print()
    for sid, waiting in blocked(rows).items():
        print(f"{sid:<3} waiting on {', '.join(waiting)}")


if __name__ == "__main__":
    main()
