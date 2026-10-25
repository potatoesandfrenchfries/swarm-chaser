"""Summarise the white-box activation sample for the Compare page: probe AUC per layer and a 2D view.

    git show origin/whitebox-csv-data-for-visualisation:src/llm_thought_visualisation/activations_qwen-qwen2-5-3b-instruct.csv > /tmp/act.csv
    uv run python ui/scripts/whitebox-probe.py /tmp/act.csv ui/data/whitebox-probe.json

Same probe and split as src/whitebox/classify.py: standardised logistic regression (C=0.1), five folds
grouped by run so steps from one run never sit on both sides. The shuffled-label AUC is the leakage
control and should sit near 0.5. `scores` holds each step's held-out probability of being malicious
and its true label, so the page can show how far apart the two groups sit.
"""
import csv, json, sys
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

rows = list(csv.reader(open(sys.argv[1])))[1:]
out = {"layers": []}
for layer in sorted({int(r[4]) for r in rows}):
    sub = [r for r in rows if int(r[4]) == layer]
    X = np.array([[float(v) for v in r[5:]] for r in sub]); y = np.array([int(r[2]) for r in sub]); g = [r[0] for r in sub]
    pipe = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, C=0.1))
    p = cross_val_predict(pipe, X, y, groups=g, cv=GroupKFold(5), method="predict_proba")[:, 1]
    rng = np.random.default_rng(0); ys = rng.permutation(y)
    ps = cross_val_predict(pipe, X, ys, groups=g, cv=GroupKFold(5), method="predict_proba")[:, 1]
    out["layers"].append({"layer": layer, "auc": round(roc_auc_score(y, p), 3), "accuracy": round(accuracy_score(y, p > 0.5), 3),
                          "shuffled_auc": round(roc_auc_score(ys, ps), 3),
                          "scores": [[round(float(s), 3), int(l)] for s, l in zip(p, y)]})
    print(layer, out["layers"][-1]["auc"], out["layers"][-1]["accuracy"], out["layers"][-1]["shuffled_auc"])
out["steps"] = len(rows) // len(out["layers"]); out["runs"] = len({r[0] for r in rows})
json.dump(out, open(sys.argv[2], "w"))
