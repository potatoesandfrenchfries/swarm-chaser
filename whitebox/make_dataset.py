"""ONE-TIME white-box dataset generation -> CSV.

Runs the sandbox agent loop over every benign/malicious task pair for a given
open-weight model, captures the per-step activations, and writes ONE labelled
CSV to data/activations_<model>.csv.

Run once per model:
    python whitebox/make_dataset.py Qwen/Qwen2.5-3B-Instruct
    python whitebox/make_dataset.py Qwen/Qwen2.5-3B-Instruct 9,18,27   # only some layers

You do NOT run this again unless you change the model, the capture, or the task
set. The committed CSV is what training (whitebox_train.py) loads.

CSV layout (long format -- one row per agent step PER captured layer):
    run_id   str   trajectory id (used for grouped cross-validation)
    step     int   step index within the episode
    label    int   0 = benign, 1 = malicious
    tool     str   the tool the agent chose that step
    layer    int   which hidden-state layer this row's activation came from
    x0..xH   float the activation vector (H = model hidden size)

Note on size: the full capture is every layer. For Qwen2.5-3B that's 37 layers
x 2048 dims, which makes a large CSV. If it's too big to commit, regenerate
with a short layer list (e.g. "9,18,27") -- the training script sweeps whatever
layers are present.
"""
import csv
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from agent_loop import AgentRunner  # noqa: E402
from tasks import TASK_PAIRS  # noqa: E402

DATA_DIR = os.environ.get("WHITEBOX_DATA", os.path.join(HERE, "..", "data"))  # the container sets it to /work/data


def slug(model_name):
    return re.sub(r"[^A-Za-z0-9]+", "-", model_name).strip("-").lower()


def main(model_name, layers):
    runner = AgentRunner(model_name)
    H = runner.hidden_size
    sel = layers if layers is not None else list(range(runner.num_layers))
    print(f"Loaded {model_name}: {runner.num_layers} layers x {H} dims on {runner.device}")
    print(f"Saving layers: {sel}\n")

    os.makedirs(DATA_DIR, exist_ok=True)
    out = os.path.join(DATA_DIR, f"activations_{slug(model_name)}.csv")

    n_steps = 0
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["run_id", "step", "label", "tool", "layer"] + [f"x{j}" for j in range(H)])
        for i, pair in enumerate(TASK_PAIRS):
            for label, key in ((0, "benign"), (1, "malicious")):
                run_id = f"{pair['theme']}-{key}-{i}"
                recs = runner.run_task(pair[key], run_id=run_id, label=label)
                for r in recs:
                    n_steps += 1
                    vec = r["vec"]  # (num_layers, H)
                    for layer in sel:
                        row = [run_id, r["step"], r["label"], r["tool"], layer]
                        row.extend(f"{v:.5f}" for v in vec[layer].tolist())
                        w.writerow(row)
                print(f"  {run_id}: {len(recs)} steps "
                      f"(tools: {', '.join(r['tool'] for r in recs)})")

    size_mb = os.path.getsize(out) / 1e6
    print(f"\nWrote {out}  ({size_mb:.1f} MB)")
    print(f"  {n_steps} agent steps x {len(sel)} layers = {n_steps * len(sel)} rows | "
          f"{len(TASK_PAIRS)} task pairs")
    if size_mb > 50:
        print("  WARNING: >50 MB. GitHub will complain. Regenerate with a short layer "
              'list, e.g.  python whitebox/make_dataset.py <model> 9,18,27')


def parse_layers(arg):
    if not arg:
        return None
    return [int(x) for x in arg.split(",") if x.strip() != ""]


if __name__ == "__main__":
    model = sys.argv[1] if len(sys.argv) > 1 else "Qwen/Qwen2.5-3B-Instruct"
    layers = parse_layers(sys.argv[2]) if len(sys.argv) > 2 else None
    main(model, layers)
