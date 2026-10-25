"""How fast a claim is repeated or corrected, as survival curves.

"Was it repeated?" (`spread.linker.spread_share_intervals`) throws away when. Time to the first repeat keeps it, and
handles claims observed for different lengths: a claim with no repeat yet is censored at the end of its window, not
counted as never repeated. Claims and edges are dicts (`dataclasses.asdict` of `Claim` and `SpreadEdge`).
"""
from datetime import datetime
from math import nan
from typing import Iterable

from stats.maths import chi2_sf


def _time(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def time_to_first(claims: list[dict], edges: list[dict], relations: Iterable[str], horizon_hours: float) -> dict[str, tuple[float, bool]]:
    """claim_id -> (hours, event). The hours to the claim's first edge with one of `relations` (event True) or
    `horizon_hours` (event False, censored) when there is none inside the window. Edges dated before the claim
    are ignored."""
    relations = set(relations)
    start = {c["claim_id"]: _time(c["ts"]) for c in claims}
    first: dict[str, float] = {}
    for e in edges:
        if e["relation"] not in relations or e["claim_id"] not in start:
            continue
        hours = (_time(e["ts"]) - start[e["claim_id"]]).total_seconds() / 3600
        if 0 <= hours <= horizon_hours:
            first[e["claim_id"]] = min(hours, first.get(e["claim_id"], hours))
    return {cid: (first[cid], True) if cid in first else (horizon_hours, False) for cid in start}


def kaplan_meier(durations: list[float], events: list[bool]) -> list[dict]:
    """Kaplan-Meier curve: one point per time with an event, giving the share still unrepeated (`survival`), those at
    risk and the events there."""
    ordered = sorted(zip(durations, events))
    at_risk, points, surv, i = len(ordered), [], 1.0, 0
    while i < len(ordered):
        t = ordered[i][0]
        j = i
        while j < len(ordered) and ordered[j][0] == t:
            j += 1
        n_events = sum(e for _, e in ordered[i:j])
        if n_events:
            surv *= 1 - n_events / at_risk
            points.append({"t": float(t), "survival": surv, "at_risk": at_risk, "events": n_events})
        at_risk -= j - i
        i = j
    return points


def km_median(points: list[dict]) -> float:
    """First time the curve falls to 0.5 or below; NaN if it never does within the window."""
    return next((p["t"] for p in points if p["survival"] <= 0.5), nan)


def logrank(d1: list[float], e1: list[bool], d2: list[float], e2: list[bool]) -> dict:
    """Log-rank test that two groups share one curve. `hazard_ratio` is the observed-over-expected ratio of group 1
    to group 2 (below 1: group 1's first repeat comes later). NaNs if no event happened."""
    ordered = sorted([(t, bool(e), 1) for t, e in zip(d1, e1)] + [(t, bool(e), 2) for t, e in zip(d2, e2)])
    n, n1 = len(ordered), len(d1)
    obs1 = exp1 = var = obs_all = 0.0
    i = 0
    while i < len(ordered):
        t = ordered[i][0]
        j = i
        while j < len(ordered) and ordered[j][0] == t:
            j += 1
        tied = ordered[i:j]
        events = sum(e for _, e, _ in tied)
        if events:
            obs_all += events
            obs1 += sum(1 for _, e, g in tied if e and g == 1)
            exp1 += events * n1 / n
            if n > 1:
                var += events * (n1 / n) * (1 - n1 / n) * (n - events) / (n - 1)
        n -= j - i
        n1 -= sum(1 for _, _, g in tied if g == 1)
        i = j
    if var == 0:
        return {"chi2": nan, "p": nan, "hazard_ratio": nan}
    stat = (obs1 - exp1) ** 2 / var
    obs2, exp2 = obs_all - obs1, obs_all - exp1
    return {"chi2": stat, "p": chi2_sf(stat, 1), "hazard_ratio": (obs1 / exp1) / (obs2 / exp2) if exp1 and exp2 and obs2 else nan}
