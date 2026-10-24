"""The whitebox classifier (`whitebox/classify.py`, inside the container) and the observer (`sandbox.blackbox`) must stay comparable.

Skipped when scikit-learn is not installed (the fast CI job), where only the stdlib observer runs.
"""

import random
import sys

import pytest

from conftest import REPO_ROOT

pytest.importorskip("sklearn")

sys.path.insert(0, str(REPO_ROOT / "whitebox"))  # its modules import each other flat, as they do in the image

import classify  # noqa: E402

from sandbox import blackbox, orchestrator  # noqa: E402


def synthetic(n=60, signal=3.0, seed=3):
    rng = random.Random(seed)
    y = [i % 2 for i in range(n)]
    return [[signal * label + rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1)] for label in y], y


def shared(X, y, cv=5, seed=0):
    """Both models on the same folds, as the orchestrator does: folds for the observer, the same as splits for the probe."""
    folds = blackbox.stratified_folds(y, cv, seed)
    everyone = set(range(len(y)))
    splits = [(sorted(everyone - set(fold)), sorted(fold)) for fold in folds]
    return classify.evaluate(X, y, splits=splits, seed=seed), blackbox.evaluate(X, y, folds=folds, seed=seed)


def test_every_compared_metric_exists_under_both_models_names():
    whitebox, observer = shared(*synthetic())
    for _, observer_key, whitebox_key in orchestrator.COMPARED:
        assert observer_key in observer and whitebox_key in whitebox
    assert whitebox["n"] == observer["n"] and whitebox["folds"] == observer["folds"]


def test_the_blackbox_fit_is_the_whiteboxs_fit_on_the_same_features():
    X, y = synthetic()
    ours = blackbox.train_final(X, y).predict_proba(X)
    theirs = classify.train_final(X, y).predict_proba(X)[:, 1]
    assert max(abs(a - b) for a, b in zip(ours, theirs, strict=True)) < 1e-3


def test_the_two_agree_on_how_good_the_features_are_when_scored_on_the_same_folds():
    whitebox, observer = shared(*synthetic())
    assert abs(whitebox["accuracy"] - observer["accuracy_pooled"]) < 0.1
    assert abs(whitebox["auc"] - observer["auc_pooled"]) < 0.05
    assert whitebox["auc_shuffled"] < whitebox["auc"] - 0.2 and observer["auc_shuffled"] < observer["auc_pooled"] - 0.2


def test_given_splits_are_used_as_they_are():
    X, y = synthetic(n=20)
    splits = [([i for i in range(20) if i % 4 != k], [i for i in range(20) if i % 4 == k]) for k in range(4)]
    result = classify.evaluate(X, y, splits=splits)
    assert result["folds"] == 4 and result["n"] == 20


def test_without_splits_whole_runs_are_held_out_together():
    X, y = synthetic(n=40)
    groups = [i // 4 for i in range(40)]  # ten runs of four steps each
    result = classify.evaluate(X, y, groups, cv=5)
    assert result["folds"] == 5 and result["n"] == 40
    with pytest.raises(ValueError, match="2 distinct"):
        classify.evaluate(X, y, [0] * 40)


def test_the_shuffled_label_control_is_seeded():
    X, y = synthetic()
    one, again, other = (classify.evaluate(X, y, [i // 2 for i in range(60)], seed=s) for s in (1, 1, 2))
    assert one == again and one["auc_shuffled"] != other["auc_shuffled"]
