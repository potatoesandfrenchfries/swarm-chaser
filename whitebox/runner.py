"""Container entrypoint: the only door into the whitebox half. Every command works on the mounted /work.

    run       tasks.json  ->  events.jsonl, activations/<run_id>.npy (steps x layers x hidden, the focus agent), failures.json
    evaluate  plan.json   ->  whitebox_result.json

    dataset   every benign/malicious pair in tasks.py  ->  data/activations_<model>.csv     (make_dataset.py)
    train     that csv  ->  data/whitebox_<model>.joblib and _metrics.json, with a layer sweep (whitebox_train.py)
    probe     a few pairs side by side, to see whether the model takes the bait               (probe.py)

`run` talks to the host over stdin and stdout, one JSON object per line. Each round the container sends an
`influencer_request` (the public board) and waits for `{"message": str | null}`: the outside model's turn. Nothing
else crosses; the model's own prints go to stderr so they cannot corrupt the protocol.

`plan.json` is written by src/sandbox/orchestrator.py outside the container: which run, step and layer make each
row, the labels, and the folds, so the whitebox probe is scored on exactly the rows and folds the observer is.
`dataset` and `train` are the offline pipeline: they never talk to the host, and write under $WHITEBOX_DATA
(/work/data in the image). This file never imports from src/.
"""

import argparse
import json
import re
import sys
from pathlib import Path

RUN_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]*")
DEFAULT_MODEL = "Qwen/Qwen2.5-3B-Instruct"


def run_tasks(tasks: list[dict], out: Path, ask_influencer, model_name: str = DEFAULT_MODEL) -> dict:
    """Run every episode, saving each run's activations as it finishes. An episode that crashes is recorded, not fatal."""
    import agent_loop
    import environment
    import numpy as np

    (out / "activations").mkdir(parents=True, exist_ok=True)
    for stale in (out / "activations").glob("*.npy"):
        stale.unlink()
    events = out / "events.jsonl"
    events.write_text("")
    emit = environment.make_emitter(events)

    agent = agent_loop.AgentRunner(model_name)
    failures = {}
    for task in tasks:
        run_id = task["run_id"]
        if not RUN_ID.fullmatch(run_id):
            failures[run_id] = "run_id must be letters, digits, '_', '.' or '-'"
            continue
        try:
            captured = environment.run_episode(task, agent.step, ask_influencer, emit)
        except EOFError:
            raise  # the host has gone: every later episode would fail the same way
        except Exception as problem:  # one bad run must not cost the batch
            failures[run_id] = f"{type(problem).__name__}: {problem}"
            continue
        if captured:
            np.save(out / "activations" / f"{run_id}.npy", np.stack(captured))  # (steps, layers, hidden)
    (out / "failures.json").write_text(json.dumps(failures, indent=1, sort_keys=True))
    return failures


def evaluate_plan(plan: dict, out: Path) -> dict:
    """Cross-validate the whitebox probe on the plan's rows and folds, and write `whitebox_result.json`."""
    import classify
    import numpy as np

    layer, rows = plan["layer"], plan["rows"]
    vectors = []
    for r in rows:
        captured = np.load(out / "activations" / f"{r['run_id']}.npy")  # (steps, layers, hidden)
        if not 0 <= layer < captured.shape[1]:
            raise ValueError(f"layer {layer} is out of range: the capture has layers 0 to {captured.shape[1] - 1}")
        vectors.append(captured[r["step"] - 1, layer])
    X, y = np.stack(vectors).astype(np.float32), [r["label"] for r in rows]
    everyone = set(range(len(rows)))
    splits = [(sorted(everyone - set(fold)), sorted(fold)) for fold in plan["folds"]]
    result = classify.evaluate(X, y, splits=splits, seed=plan["seed"])
    result["layer"] = layer
    (out / "whitebox_result.json").write_text(json.dumps(result, indent=1, sort_keys=True))
    return result


def stdio_influencer(stdin=None, stdout=None):
    """`ask_influencer` over the host pipe. Reads the real stdout for the protocol and sends everything else to stderr."""
    stdin = stdin or sys.stdin
    protocol = stdout or sys.stdout
    if stdout is None:
        sys.stdout = sys.stderr  # prints from the model libraries must not land in the protocol

    def ask(request: dict):
        protocol.write(json.dumps(request) + "\n")
        protocol.flush()
        line = stdin.readline()
        if not line:
            raise EOFError("the host closed the channel")
        message = json.loads(line).get("message")
        return message if isinstance(message, str) and message else None

    return ask


def parse_layers(text: str | None):
    return [int(x) for x in text.split(",") if x.strip()] if text else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run")
    run.add_argument("--tasks", type=Path, required=True)
    run.add_argument("--out", type=Path, required=True)
    run.add_argument("--model", default=DEFAULT_MODEL)
    evaluate = commands.add_parser("evaluate")
    evaluate.add_argument("--plan", type=Path, required=True)
    evaluate.add_argument("--out", type=Path, required=True)
    dataset = commands.add_parser("dataset")
    dataset.add_argument("--model", default=DEFAULT_MODEL)
    dataset.add_argument("--layers", help="comma-separated, e.g. 9,18,27; default every layer (a large csv)")
    train = commands.add_parser("train")
    train.add_argument("--model", default=DEFAULT_MODEL)
    probe = commands.add_parser("probe")
    probe.add_argument("--model", default=DEFAULT_MODEL)
    probe.add_argument("--pairs", type=int, default=3)
    args = parser.parse_args(argv)

    if args.command == "run":
        failures = run_tasks(json.loads(args.tasks.read_text()), args.out, stdio_influencer(), args.model)
        print(f"{len(failures)} run(s) failed", file=sys.stderr)
    elif args.command == "evaluate":
        evaluate_plan(json.loads(args.plan.read_text()), args.out)
    elif args.command == "dataset":
        import make_dataset

        make_dataset.main(args.model, parse_layers(args.layers))
    elif args.command == "train":
        import whitebox_train

        whitebox_train.main(args.model)
    else:
        import probe as probe_module

        probe_module.main(args.model, args.pairs)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
