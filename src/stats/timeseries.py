"""The false-claim share over calendar months: is it moving, and did it jump?

MVP.md goal 2 stops at a per-month table with Wilson intervals (`report.headline.breakdown`). These add what the
table cannot say. Input is a list of verdict records (`report.headline.verdict_records`, plus `agent` from
`clustering.add_agent` for the cluster-robust fit), from one checker vendor at a time (`clustering.one_judge`).

Two cautions apply to every number here, and the page repeats them. Models ran in different periods, so a trend in
time is also a trend in model. And claims from one agent are not independent: the permutation and Cochran-Armitage
p-values treat them as if they were, so read them as optimistic; `trend_logit` is the one that allows for it.
"""
import random
from collections import defaultdict
from math import exp, nan, sqrt
from statistics import StatisticsError, correlation

from stats.maths import norm_sf, solve, xlogy


def month_index(label: str) -> int:
    """"2025-06" -> months since year 0, so a gap between two episodes is a gap in the index."""
    year, month = label.split("-")
    return int(year) * 12 + int(month) - 1


def month_label(index: int) -> str:
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def monthly_series(records: list[dict], verdict: str = "contradicted") -> list[tuple[str, int, int]]:
    """(month, k, n) for every calendar month from the first to the last, k being records with `verdict`.
    A month with no records appears as (month, 0, 0), so gaps are visible and the trend uses real distances."""
    counts: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    for r in records:
        c = counts[month_index(r["ts"][:7])]
        c[0] += r["verdict"] == verdict
        c[1] += 1
    if not counts:
        return []
    return [(month_label(i), *counts[i]) if i in counts else (month_label(i), 0, 0) for i in range(min(counts), max(counts) + 1)]


def longest_run(series: list[tuple[str, int, int]], min_n: int = 1) -> int:
    """Longest stretch of consecutive months with at least `min_n` records each."""
    best = run = 0
    for _, _, n in series:
        run = run + 1 if n >= min_n else 0
        best = max(best, run)
    return best


def cochran_armitage(series: list[tuple[str, int, int]]) -> dict:
    """Cochran-Armitage test for a linear trend in the share across months. `slope_per_month` is the change in the
    share per month (a linear-probability slope), `p` the two-sided p-value. NaNs when there is nothing to test."""
    rows = [(month_index(m), k, n) for m, k, n in series if n]
    big_n = sum(n for _, _, n in rows)
    total_k = sum(k for _, k, _ in rows)
    if len({x for x, _, _ in rows}) < 2 or total_k in (0, big_n):
        return {"n": big_n, "z": nan, "p": nan, "slope_per_month": nan}
    pbar = total_k / big_n
    t = sum(x * (k - n * pbar) for x, k, n in rows)
    sxx = sum(n * x * x for x, _, n in rows) - sum(n * x for x, _, n in rows) ** 2 / big_n
    z = t / sqrt(pbar * (1 - pbar) * sxx)
    xbar = sum(n * x for x, _, n in rows) / big_n
    slope = sum(n * (x - xbar) * (k / n - pbar) for x, k, n in rows) / sum(n * (x - xbar) ** 2 for x, _, n in rows)
    return {"n": big_n, "z": z, "p": 2 * norm_sf(abs(z)), "slope_per_month": slope}


def _fit_logistic(t: list[float], y: list[float]) -> tuple[float, float] | None:
    """Intercept and slope of a logistic regression on one covariate, by Newton's method. None if it diverges
    (the outcome is separated by the covariate) or the information matrix is singular."""
    b0 = b1 = 0.0
    for _ in range(50):
        g0 = g1 = h00 = h01 = h11 = 0.0
        for ti, yi in zip(t, y):
            p = 1 / (1 + exp(-(b0 + b1 * ti)))
            w = p * (1 - p)
            g0 += yi - p
            g1 += (yi - p) * ti
            h00, h01, h11 = h00 + w, h01 + w * ti, h11 + w * ti * ti
        try:
            d0, d1 = solve([[h00, h01], [h01, h11]], [g0, g1])
        except ValueError:
            return None
        b0, b1 = b0 + d0, b1 + d1
        if abs(b1) > 30:
            return None
        if max(abs(d0), abs(d1)) < 1e-9:
            return b0, b1
    return None


def trend_logit(records: list[dict], verdict: str = "contradicted", cluster: str = "agent") -> dict:
    """Logistic regression of "has `verdict`" on months since the first record, with a sandwich (cluster-robust)
    variance clustered on `cluster` (default the agent). Reports the odds ratio per month with a 95% interval.

    Cluster-robust errors are only trustworthy with roughly 20 or more clusters; `n_clusters` is returned so the
    page can say when there are too few. NaNs when the fit is impossible (one month, or all one outcome).
    """
    groups = sorted({r[cluster] for r in records})
    empty = {"n": len(records), "n_clusters": len(groups), "odds_ratio_per_month": nan, "low": nan, "high": nan, "p": nan}
    if not records:
        return empty
    months = [month_index(r["ts"][:7]) for r in records]
    t = [float(m - min(months)) for m in months]
    y = [float(r["verdict"] == verdict) for r in records]
    if min(t) == max(t) or min(y) == max(y):
        return empty
    fit = _fit_logistic(t, y)
    if fit is None:
        return empty
    b0, b1 = fit
    p = [1 / (1 + exp(-(b0 + b1 * ti))) for ti in t]
    h00 = sum(pi * (1 - pi) for pi in p)
    h01 = sum(pi * (1 - pi) * ti for pi, ti in zip(p, t))
    h11 = sum(pi * (1 - pi) * ti * ti for pi, ti in zip(p, t))
    scores: dict = defaultdict(lambda: [0.0, 0.0])
    for r, ti, yi, pi in zip(records, t, y, p):
        scores[r[cluster]][0] += yi - pi
        scores[r[cluster]][1] += (yi - pi) * ti
    m00 = sum(s[0] * s[0] for s in scores.values())
    m01 = sum(s[0] * s[1] for s in scores.values())
    m11 = sum(s[1] * s[1] for s in scores.values())
    det = h00 * h11 - h01 * h01
    inv = [[h11 / det, -h01 / det], [-h01 / det, h00 / det]]  # the bread
    meat = [[m00, m01], [m01, m11]]
    mid = [[sum(inv[i][k] * meat[k][j] for k in range(2)) for j in range(2)] for i in range(2)]
    var1 = sum(mid[1][k] * inv[k][1] for k in range(2))
    g, n = len(groups), len(records)
    var1 *= g / (g - 1) * (n - 1) / (n - 2) if g > 1 else 1.0  # the usual small-sample correction
    se = sqrt(var1)
    return {**empty, "odds_ratio_per_month": exp(b1), "low": exp(b1 - 1.96 * se), "high": exp(b1 + 1.96 * se), "p": 2 * norm_sf(abs(b1 / se)) if se else nan}


def _lr(k: int, n: int, k_all: int, n_all: int) -> float:
    """Twice the log-likelihood gain of a share of k/n before a split and the rest after, over one share throughout."""

    def ll(a: int, b: int) -> float:
        return xlogy(a, a / b) + xlogy(b - a, 1 - a / b) if b else 0.0

    return 2 * (ll(k, n) + ll(k_all - k, n_all - n) - ll(k_all, n_all))


def change_point(records: list[dict], verdict: str = "contradicted", permutations: int = 999, seed: int = 0) -> dict:
    """Best single split of the months into "before" and "after" with different shares, by the binomial
    likelihood ratio, and a permutation p-value for the best split (outcomes shuffled across claims, month sizes
    kept, so the search over splits is allowed for). `after` is the first month of the later period.

    A step in the share is also a step in whichever model took over that month; this finds where, not why.
    """
    months = sorted({month_index(r["ts"][:7]) for r in records})
    nothing = {"after": None, "lr": nan, "p": nan, "share_before": nan, "share_after": nan}
    if len(months) < 2:
        return nothing
    where = {m: i for i, m in enumerate(months)}
    code = [where[month_index(r["ts"][:7])] for r in records]
    y = [int(r["verdict"] == verdict) for r in records]
    if min(y) == max(y):
        return nothing
    n_m = [0] * len(months)
    for c in code:
        n_m[c] += 1

    def best(outcomes: list[int]) -> tuple[float, int]:
        k_m = [0] * len(months)
        for c, v in zip(code, outcomes):
            k_m[c] += v
        k_all, n_all = sum(k_m), len(outcomes)
        best_lr, best_i, k_cum, n_cum = -1.0, 0, 0, 0
        for i in range(len(months) - 1):
            k_cum, n_cum = k_cum + k_m[i], n_cum + n_m[i]
            lr = _lr(k_cum, n_cum, k_all, n_all)
            if lr > best_lr:
                best_lr, best_i = lr, i
        return best_lr, best_i

    lr, i = best(y)
    rng = random.Random(seed)
    shuffled, exceed = y[:], 0
    for _ in range(permutations):
        rng.shuffle(shuffled)
        exceed += best(shuffled)[0] >= lr - 1e-12
    before = [v for c, v in zip(code, y) if c <= i]
    after = [v for c, v in zip(code, y) if c > i]
    return {"after": month_label(months[i + 1]), "lr": lr, "p": (1 + exceed) / (1 + permutations), "share_before": sum(before) / len(before), "share_after": sum(after) / len(after)}


def lag1_autocorrelation(series: list[tuple[str, int, int]]) -> float:
    """Correlation of the monthly share with the previous month's, over consecutive months that both have records.
    Descriptive: with a few dozen months it is a rough guide to whether months move together, not a test."""
    shares = [(k / n if n else None) for _, k, n in series]
    pairs = [(a, b) for a, b in zip(shares, shares[1:]) if a is not None and b is not None]
    if len(pairs) < 3:
        return nan
    try:
        return correlation([a for a, _ in pairs], [b for _, b in pairs])
    except StatisticsError:  # one of the two is constant
        return nan
