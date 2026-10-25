"""Contrasts between two shares: the difference with an interval, an exact test, and how many runs it takes.

Used wherever two groups are set side by side: false against supported claims being repeated (spread), the
planted-claim arm against the intervention arm (sandbox), a perturbation catch rate against its control.
Every interval is a 95% Newcombe-Wilson interval, built from the same Wilson intervals as the rest of the repo.
"""
from math import sqrt

from report.headline import wilson
from stats.maths import fisher_two_sided, norm_ppf

NAN = float("nan")


def risk_difference(k1: int, n1: int, k2: int, n2: int) -> dict:
    """Share 1 minus share 2 (k successes of n), with the Newcombe hybrid-score 95% interval. NaNs if either n is 0."""
    p1, l1, u1 = wilson(k1, n1)
    p2, l2, u2 = wilson(k2, n2)
    if n1 == 0 or n2 == 0:
        return {"p1": p1, "p2": p2, "difference": NAN, "low": NAN, "high": NAN}
    d = p1 - p2
    return {
        "p1": p1,
        "p2": p2,
        "difference": d,
        "low": d - sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2),
        "high": d + sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2),
    }


def fisher_p(k1: int, n1: int, k2: int, n2: int) -> float:
    """Two-sided Fisher exact p-value for two shares. Exact, so safe at the run counts a sandbox gives."""
    if n1 == 0 or n2 == 0:
        return NAN
    return fisher_two_sided(k1, n1, k2, n2)


def number_needed(difference: float) -> float:
    """1 / |difference|: how many runs must get the intervention for one fewer to act on the planted claim.
    Infinite when there is no difference."""
    return 1 / abs(difference) if difference else float("inf")


def required_n_per_arm(p1: float, p2: float, alpha: float = 0.05, power: float = 0.8) -> int:
    """Runs per arm to detect shares p1 against p2 with a two-sided test (normal approximation, rounded up)."""
    if p1 == p2:
        return 0
    z = norm_ppf(1 - alpha / 2) + norm_ppf(power)
    pbar = (p1 + p2) / 2
    n = z * z * 2 * pbar * (1 - pbar) / (p1 - p2) ** 2
    return int(-(-n // 1))


def min_detectable_difference(n1: int, n2: int, p_ref: float = 0.5, alpha: float = 0.05, power: float = 0.8) -> float:
    """Smallest difference the design could have found, with the variance taken at `p_ref` (0.5 is the worst case).
    An approximation: it says what a null result rules out, so the page can say what "no effect" would mean."""
    if n1 == 0 or n2 == 0:
        return NAN
    z = norm_ppf(1 - alpha / 2) + norm_ppf(power)
    return float(z * sqrt(p_ref * (1 - p_ref) * (1 / n1 + 1 / n2)))
