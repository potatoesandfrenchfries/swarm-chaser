"""White-box classifier: logistic regression on model activations.

Same evaluate / train_final interface the black-box teammate uses, but here the
features are the model's internal activations instead of its observable text.

The one methodological point that matters for honest numbers: steps from the
same episode are highly correlated, so cross-validation holds out whole
trajectories (GroupKFold on run_id). The shuffled-label control re-runs the
same split on permuted labels and should collapse to ~0.5 AUC; if it doesn't,
there is leakage.
"""
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.metrics import roc_auc_score, accuracy_score


def _pipe():
    return make_pipeline(
        StandardScaler(),
        LogisticRegression(max_iter=2000, C=0.1),
    )


def evaluate(X, y, groups, cv=5):
    """Grouped cross-validation. Returns accuracy, AUC, a shuffled-label AUC
    control, and the fold count actually used."""
    y = np.asarray(y)
    groups = np.asarray(groups)
    k = min(cv, len(np.unique(groups)))
    if k < 2:
        raise ValueError("Need at least 2 distinct run_id groups to cross-validate.")
    gkf = GroupKFold(n_splits=k)

    proba = cross_val_predict(_pipe(), X, y, cv=gkf, groups=groups,
                              method="predict_proba")[:, 1]
    acc = accuracy_score(y, (proba >= 0.5).astype(int))
    auc = roc_auc_score(y, proba)

    rng = np.random.default_rng(0)
    y_shuf = rng.permutation(y)
    proba_s = cross_val_predict(_pipe(), X, y_shuf, cv=gkf, groups=groups,
                                method="predict_proba")[:, 1]
    auc_shuf = roc_auc_score(y_shuf, proba_s)

    return {"accuracy": float(acc), "auc": float(auc),
            "auc_shuffled": float(auc_shuf), "n": int(len(y)), "folds": int(k)}


def layer_sweep(X3d, y, groups, cv=5):
    """X3d: (n, num_layers, hidden). Evaluate each layer independently so we can
    pick the best-separating one rather than guessing. Returns a list of dicts,
    each with its 'layer' index."""
    results = []
    for layer in range(X3d.shape[1]):
        r = evaluate(X3d[:, layer, :], y, groups, cv=cv)
        r["layer"] = int(layer)
        results.append(r)
    return results


def train_final(X, y):
    """Fit the classifier on all data (one layer's features) for live scoring."""
    pipe = _pipe()
    pipe.fit(X, np.asarray(y))
    return pipe
