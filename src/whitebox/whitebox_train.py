"""Train the white-box regression model from the generated CSV dataset.

    python src/whitebox/whitebox_train.py Qwen/Qwen2.5-3B-Instruct

Loads data/activations_<model>.csv, sweeps every layer present with grouped
cross-validation (whole trajectories held out together, so steps from one run
never straddle the split), picks the best-separating layer, trains the final
classifier on it, and saves it to data/whitebox_<model>.joblib with a metrics
summary. One trained model per agent, exactly as intended.
"""
import os
import sys
import re
import json

import numpy as np
import pandas as pd
import joblib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from classify import evaluate, train_final  # noqa: E402

DATA_DIR = os.path.join(HERE, "..", "data")


def slug(model_name):
    return re.sub(r"[^A-Za-z0-9]+", "-", model_name).strip("-").lower()


def main(model_name):
    s = slug(model_name)
    csv_path = os.path.join(DATA_DIR, f"activations_{s}.csv")
    df = pd.read_csv(csv_path)
    feat_cols = [c for c in df.columns if c.startswith("x")]

    n_traj = df["run_id"].nunique()
    layers = sorted(df["layer"].unique())
    print(f"Loaded {csv_path}")
    print(f"  {len(df)} rows | {len(layers)} layers | {len(feat_cols)} dims | "
          f"{n_traj} trajectories\n")

    sweep = []
    for layer in layers:
        sub = df[df["layer"] == layer]
        X = sub[feat_cols].to_numpy(dtype=np.float32)
        y = sub["label"].to_numpy()
        groups = sub["run_id"].to_numpy()
        r = evaluate(X, y, groups)
        r["layer"] = int(layer)
        sweep.append(r)
        print(f"  layer {int(layer):2d}: AUC={r['auc']:.3f}  acc={r['accuracy']:.3f}  "
              f"shuffled-AUC={r['auc_shuffled']:.3f}  (n={r['n']}, {r['folds']} folds)")

    best = max(sweep, key=lambda r: r["auc"])
    print(f"\nBest layer: {best['layer']}  (AUC={best['auc']:.3f}, "
          f"shuffled {best['auc_shuffled']:.3f})")

    sub = df[df["layer"] == best["layer"]]
    clf = train_final(sub[feat_cols].to_numpy(dtype=np.float32), sub["label"].to_numpy())
    model_path = os.path.join(DATA_DIR, f"whitebox_{s}.joblib")
    joblib.dump({"clf": clf, "layer": int(best["layer"]), "model_name": model_name}, model_path)

    metrics_path = os.path.join(DATA_DIR, f"whitebox_{s}_metrics.json")
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump({"model_name": model_name, "best_layer": int(best["layer"]), "sweep": sweep},
                  f, indent=2)

    print(f"Saved classifier -> {model_path}")
    print(f"Saved metrics    -> {metrics_path}")


if __name__ == "__main__":
    model = sys.argv[1] if len(sys.argv) > 1 else "Qwen/Qwen2.5-3B-Instruct"
    main(model)
