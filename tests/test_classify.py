"""The whitebox classifier (`sandbox.classify`) and the blackbox model (`sandbox.blackbox`) must stay comparable.

Skipped when scikit-learn is not installed (the fast CI job), where only the stdlib blackbox runs.
"""

import random

import pytest

pytest.importorskip("sklearn")

from sandbox import blackbox, classify  # noqa: E402


def synthetic(n=60, signal=3.0, seed=3):
    rng = random.Random(seed)
    y = [i % 2 for i in range(n)]
    return [[signal * label + rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1)] for label in y], y


def test_both_models_report_the_same_metrics_under_the_same_names():
    X, y = synthetic()
    whitebox, blackbox_result = classify.evaluate(X, y, cv=5), blackbox.evaluate(X, y, cv=5)
    assert set(whitebox) <= set(blackbox_result)


def test_the_blackbox_fit_is_the_whiteboxs_fit_on_the_same_features():
    X, y = synthetic()
    ours = blackbox.train_final(X, y).predict_proba(X)
    theirs = classify.train_final(X, y).predict_proba(X)[:, 1]
    assert max(abs(a - b) for a, b in zip(ours, theirs, strict=True)) < 1e-3


def test_the_two_agree_on_how_good_the_features_are():
    X, y = synthetic()
    whitebox, blackbox_result = classify.evaluate(X, y, cv=5), blackbox.evaluate(X, y, cv=5)
    assert abs(whitebox["accuracy"] - blackbox_result["accuracy"]) < 0.15
    assert abs(whitebox["auc"] - blackbox_result["auc"]) < 0.1
    assert whitebox["shuffled_accuracy"] < whitebox["accuracy"] - 0.2
