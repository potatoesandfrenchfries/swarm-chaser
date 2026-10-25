"""Beyond a single kappa: where two checker vendors differ, and whether one is harsher.

Cohen's kappa (`eval.validation.cohen_kappa`) is one number, and it falls when one label dominates even if the
vendors rarely disagree. These add the confusion matrix, agreement on each label, Gwet's AC1 (steadier when one
label dominates) and two tests of whether one vendor hands out a label more often. Inputs are two equal-length
label lists aligned by claim, as `eval.validation.agreement_report` builds them.
"""
from math import nan

from report.headline import VERDICTS
from stats.maths import binom_two_sided_half, chi2_sf, solve


def confusion_matrix(a: list, b: list, labels: tuple = VERDICTS) -> list[list[int]]:
    """Counts with vendor A's label down the side and vendor B's across the top, in the order of `labels`."""
    index = {label: i for i, label in enumerate(labels)}
    table = [[0] * len(labels) for _ in labels]
    for x, y in zip(a, b):
        table[index[x]][index[y]] += 1
    return table


def positive_specific_agreement(a: list, b: list, label: str) -> float:
    """2 * (both said `label`) / (times A said it + times B said it). Agreement on one label alone, which a rare
    label such as "contradicted" needs because overall agreement is mostly the common labels."""
    both = sum(x == label and y == label for x, y in zip(a, b))
    total = sum(x == label for x in a) + sum(y == label for y in b)
    return 2 * both / total if total else nan


def gwet_ac1(a: list, b: list, labels: tuple = VERDICTS) -> float:
    """Gwet's AC1: chance agreement from how often each label is used by either vendor, over `len(labels)` labels."""
    n = len(a)
    if n == 0:
        return nan
    observed = sum(x == y for x, y in zip(a, b)) / n
    chance = sum(((a.count(label) + b.count(label)) / (2 * n)) * (1 - (a.count(label) + b.count(label)) / (2 * n)) for label in labels) / (len(labels) - 1)
    return (observed - chance) / (1 - chance) if chance != 1 else nan


def stuart_maxwell(a: list, b: list, labels: tuple = VERDICTS) -> dict:
    """Stuart-Maxwell test that the two vendors use the labels equally often (marginal homogeneity). A small p
    means one vendor is systematically harsher or laxer, which kappa does not show. Labels neither vendor used
    are dropped; with fewer than two left there is nothing to test."""
    full = confusion_matrix(a, b, labels)
    keep = [i for i in range(len(labels)) if sum(full[i]) + sum(row[i] for row in full) > 0]
    table = [[full[i][j] for j in keep] for i in keep]
    k = len(table)
    if k < 2:
        return {"chi2": nan, "df": 0, "p": nan}
    rows, cols = [sum(r) for r in table], [sum(table[i][j] for i in range(k)) for j in range(k)]
    d = [rows[i] - cols[i] for i in range(k - 1)]
    if not any(d):  # identical marginals: nothing to detect, and the covariance is singular
        return {"chi2": 0.0, "df": k - 1, "p": 1.0}
    cov = [[(rows[i] + cols[i] - 2 * table[i][i]) if i == j else -(table[i][j] + table[j][i]) for j in range(k - 1)] for i in range(k - 1)]
    try:
        stat = sum(di * xi for di, xi in zip(d, solve(cov, d)))
    except ValueError:
        return {"chi2": nan, "df": k - 1, "p": nan}
    return {"chi2": stat, "df": k - 1, "p": chi2_sf(stat, k - 1)}


def mcnemar_exact(a: list, b: list, label: str) -> dict:
    """Exact McNemar test on one label: of the claims where exactly one vendor said `label`, did they split evenly?
    `only_a` and `only_b` say which way it leans."""
    only_a = sum(x == label and y != label for x, y in zip(a, b))
    only_b = sum(x != label and y == label for x, y in zip(a, b))
    n = only_a + only_b
    return {"label": label, "only_a": only_a, "only_b": only_b, "p": binom_two_sided_half(min(only_a, only_b), n)}
