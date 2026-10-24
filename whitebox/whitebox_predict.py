"""Run the trained white-box classifier on live agent activations.

At inference the sandbox produces an activation stack (num_layers, hidden) per
step; this scores it with the per-model classifier and returns P(malicious).

    from whitebox_predict import WhiteboxMonitor
    mon = WhiteboxMonitor("Qwen/Qwen2.5-3B-Instruct")
    p = mon.score(activation_stack)   # float in [0, 1]

The monitor picks the classifier whose name matches the agent's model, so a
deployment running several open-weight agents loads one monitor per agent.
"""
import os
import re

import joblib
import numpy as np

DATA_DIR = os.environ.get("WHITEBOX_DATA", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data"))  # the container sets it to /work/data


def slug(model_name):
    return re.sub(r"[^A-Za-z0-9]+", "-", model_name).strip("-").lower()


class WhiteboxMonitor:
    def __init__(self, model_name):
        path = os.path.join(DATA_DIR, f"whitebox_{slug(model_name)}.joblib")
        bundle = joblib.load(path)
        self.clf = bundle["clf"]
        self.layer = bundle["layer"]
        self.model_name = model_name

    def score(self, activation_stack):
        """activation_stack: (num_layers, hidden) -- the full per-step capture --
        or a single (hidden,) vector already at the right layer. Returns
        P(malicious) in [0, 1]."""
        a = np.asarray(activation_stack, dtype=np.float32)
        vec = a[self.layer] if a.ndim == 2 else a
        return float(self.clf.predict_proba(vec.reshape(1, -1))[0, 1])
