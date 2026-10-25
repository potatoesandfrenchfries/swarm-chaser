"""Claims from one agent are not independent draws, so a plain Wilson interval is too narrow.

`cluster_bootstrap_share` resamples whole agents; `icc` and the design effect say how much narrower the plain
interval was. Records come from `report.headline.verdict_records`, which does not carry the agent, so `add_agent`
joins it back from the claims.
"""
import random
from math import nan


def add_agent(records: list[dict], claims: list[dict]) -> list[dict]:
    """The records with each claim's `agent` added. A record whose claim is unknown gets agent "?" so it is
    counted as one cluster rather than dropped."""
    agent_of = {c["claim_id"]: c["agent"] for c in claims}
    return [{**r, "agent": agent_of.get(r["claim_id"], "?")} for r in records]


def one_judge(records: list[dict], judge: str) -> list[dict]:
    """Records from one checker vendor. `report.headline.headline` counts every vendor's verdict, so a claim both
    vendors judged appears twice; the trend, change-point and cluster statistics want each claim once, so run them
    on one vendor at a time (and compare the vendors, which is itself a robustness check)."""
    return [r for r in records if r["judge"] == judge]


def _groups(records: list[dict], verdict: str, cluster: str) -> list[tuple[int, int]]:
    by: dict[str, list[int]] = {}
    for r in records:
        by.setdefault(r[cluster], []).append(r["verdict"] == verdict)
    return [(sum(v), len(v)) for v in by.values()]


def cluster_bootstrap_share(records: list[dict], verdict: str = "contradicted", cluster: str = "agent", resamples: int = 1000, seed: int = 0) -> dict:
    """Share of records with `verdict`, and a 95% percentile interval from resampling clusters with replacement.
    Seeded, so a rebuilt page shows the same interval. Few clusters make it unstable; `n_clusters` says how few."""
    groups = _groups(records, verdict, cluster)
    if not groups:
        return {"p": nan, "low": nan, "high": nan, "n_clusters": 0}
    rng = random.Random(seed)
    shares = []
    for _ in range(resamples):
        draw = [rng.choice(groups) for _ in groups]
        shares.append(sum(k for k, _ in draw) / sum(n for _, n in draw))
    shares.sort()
    k, n = (sum(g[i] for g in groups) for i in (0, 1))
    return {"p": k / n, "low": shares[int(0.025 * (resamples - 1))], "high": shares[int(0.975 * (resamples - 1))], "n_clusters": len(groups)}


def icc(records: list[dict], verdict: str = "contradicted", cluster: str = "agent") -> dict:
    """Intra-cluster correlation of "has `verdict`" by the one-way ANOVA estimator (floored at 0), and the design
    effect 1 + (mean cluster size - 1) * icc: the factor by which independence understates the variance."""
    groups = _groups(records, verdict, cluster)
    k, big_n = len(groups), sum(n for _, n in groups)
    if k < 2 or big_n <= k:
        return {"icc": nan, "design_effect": nan, "n_clusters": k}
    grand = sum(s for s, _ in groups) / big_n
    msb = sum(n * (s / n - grand) ** 2 for s, n in groups) / (k - 1)
    msw = sum(s - s * s / n for s, n in groups) / (big_n - k)  # within-cluster sum of squares of a 0/1 outcome
    n0 = (big_n - sum(n * n for _, n in groups) / big_n) / (k - 1)
    denom = msb + (n0 - 1) * msw
    value = max(0.0, (msb - msw) / denom) if denom > 0 else 0.0
    return {"icc": value, "design_effect": 1 + (big_n / k - 1) * value, "n_clusters": k}
