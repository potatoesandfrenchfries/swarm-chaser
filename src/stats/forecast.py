"""Beyond accuracy, Brier and AUC (`eval.forecaster`): is the forecaster's probability a probability?

A forecaster can rank well (high AUC) and still say 0.9 when the real rate is 0.6. These check that: a reliability
table, expected calibration error, a Brier skill score against the base rate, and a bootstrap interval for AUC.
"""
import random
from math import nan

from eval.forecaster import Prediction, base_rate_predictor, brier_score


def reliability_bins(predictions: list[Prediction], bins: int = 5) -> list[dict]:
    """Equal-width probability bins: how many predictions fell in each, their mean forecast and the share that came
    true. Empty bins are left out."""
    out = []
    for i in range(bins):
        lo, hi = i / bins, (i + 1) / bins
        inside = [p for p in predictions if lo <= p.probability < hi or (i == bins - 1 and p.probability == 1.0)]
        if inside:
            out.append({"low": lo, "high": hi, "n": len(inside), "mean_forecast": sum(p.probability for p in inside) / len(inside), "rate": sum(p.outcome for p in inside) / len(inside)})
    return out


def expected_calibration_error(predictions: list[Prediction], bins: int = 5) -> float:
    """Mean gap between forecast and outcome rate over the bins, weighted by how many predictions each holds. 0 is
    perfectly calibrated. Bin choice matters with few predictions, so the bin count is an argument."""
    if not predictions:
        return nan
    return sum(b["n"] * abs(b["mean_forecast"] - b["rate"]) for b in reliability_bins(predictions, bins)) / len(predictions)


def brier_skill_score(predictions: list[Prediction]) -> float:
    """1 - Brier / Brier of always predicting the base rate. Positive means better than the base rate; 0 no better."""
    if not predictions:
        return nan
    rate = base_rate_predictor(predictions)
    reference = brier_score([Prediction(p.item_id, rate, p.outcome) for p in predictions])
    return 1 - brier_score(predictions) / reference if reference else nan


def _rank_auc(probs: list[float], outcomes: list[bool]) -> float:
    """AUC by ranks (Mann-Whitney), the same value as `eval.forecaster.auc` with ties as half a win, in O(n log n)
    so it can be repeated for a bootstrap. NaN unless both outcomes occur."""
    n_pos = sum(outcomes)
    n_neg = len(outcomes) - n_pos
    if not n_pos or not n_neg:
        return nan
    order = sorted(range(len(probs)), key=probs.__getitem__)
    rank_sum, i = 0.0, 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and probs[order[j + 1]] == probs[order[i]]:
            j += 1
        average = (i + j) / 2 + 1  # ranks start at 1; tied values share their mean rank
        rank_sum += average * sum(outcomes[order[k]] for k in range(i, j + 1))
        i = j + 1
    return (rank_sum - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)


def auc_interval(predictions: list[Prediction], resamples: int = 1000, seed: int = 0) -> tuple[float, float]:
    """95% percentile-bootstrap interval for AUC. (NaN, NaN) unless both outcomes occur; resamples with only one
    outcome are skipped."""
    if not predictions:
        return nan, nan
    probs = [p.probability for p in predictions]
    outcomes = [p.outcome for p in predictions]
    rng = random.Random(seed)
    values = []
    for _ in range(resamples):
        pick = [rng.randrange(len(predictions)) for _ in predictions]
        a = _rank_auc([probs[i] for i in pick], [outcomes[i] for i in pick])
        if a == a:  # not NaN
            values.append(a)
    if len(values) < resamples // 2:
        return nan, nan
    values.sort()
    return values[int(0.025 * (len(values) - 1))], values[int(0.975 * (len(values) - 1))]
