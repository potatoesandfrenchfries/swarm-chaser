"""Container entrypoint: the only door into the whitebox half. Two commands, both working on the mounted /work.

    run       tasks.json  ->  events.jsonl, activations/<run_id>.npy (one row per step of the focus agent), failures.json
    evaluate  plan.json   ->  whitebox_result.json

`run` talks to the host over stdin and stdout, one JSON object per line. Each round the container sends an
`influencer_request` (the public board) and waits for `{"message": str | null}`: the outside model's turn. Nothing
else crosses; the model's own prints go to stderr so they cannot corrupt the protocol.

`plan.json` is written by src/sandbox/orchestrator.py outside the container: which run and which step make each
row, the labels, and the folds, so the whitebox probe is scored on exactly the rows and folds the observer is.
This file never imports from src/.
"""

import argparse
import json
import re
import sys
from pathlib import Path

RUN_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]*")


def run_tasks(tasks: list[dict], out: Path, ask_influencer) -> dict:
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

    agent_loop.load_model()
    failures = {}
    for task in tasks:
        run_id = task["run_id"]
        if not RUN_ID.fullmatch(run_id):
            failures[run_id] = "run_id must be letters, digits, '_', '.' or '-'"
            continue
        try:
            captured = environment.run_episode(task, agent_loop.model_step, ask_influencer, emit)
        except EOFError:
            raise  # the host has gone: every later episode would fail the same way
        except Exception as problem:  # one bad run must not cost the batch
            failures[run_id] = f"{type(problem).__name__}: {problem}"
            continue
        if captured:
            np.save(out / "activations" / f"{run_id}.npy", np.stack(captured))
    (out / "failures.json").write_text(json.dumps(failures, indent=1, sort_keys=True))
    return failures


def evaluate_plan(plan: dict, out: Path) -> dict:
    """Cross-validate the whitebox probe on the plan's rows and folds, and write `whitebox_result.json`."""
    import classify
    import numpy as np

    rows = plan["rows"]
    X = np.stack([np.load(out / "activations" / f"{r['run_id']}.npy")[r["step"] - 1] for r in rows])
    y = [r["label"] for r in rows]
    everyone = set(range(len(rows)))
    splits = [(sorted(everyone - set(fold)), sorted(fold)) for fold in plan["folds"]]
    np.random.seed(plan["seed"])  # classify.evaluate shuffles labels with the global generator
    result = {name: float(value) for name, value in classify.evaluate(X, y, cv=splits).items()}
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run")
    run.add_argument("--tasks", type=Path, required=True)
    run.add_argument("--out", type=Path, required=True)
    evaluate = commands.add_parser("evaluate")
    evaluate.add_argument("--plan", type=Path, required=True)
    evaluate.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    if args.command == "run":
        failures = run_tasks(json.loads(args.tasks.read_text()), args.out, stdio_influencer())
        print(f"{len(failures)} run(s) failed", file=sys.stderr)
    else:
        evaluate_plan(json.loads(args.plan.read_text()), args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
