"""python -m evolve run  --problem examples.auction [--archive archive] [--generations 20] ...
python -m evolve show --archive archive"""
import argparse
import importlib
import json
import sys
from pathlib import Path

from .loop import Evolver


def load_problem(dotted: str):
    """'examples.auction' or 'examples.auction:PROBLEM': a module that defines PROBLEM."""
    module_name, _, attr = dotted.partition(":")
    sys.path.insert(0, str(Path.cwd()))
    return getattr(importlib.import_module(module_name), attr or "PROBLEM")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="evolve")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="evolve; resumes an existing archive automatically")
    run.add_argument("--problem", required=True)
    run.add_argument("--archive", default="archive")
    run.add_argument("--generations", type=int, default=20, help="generations to run now")
    run.add_argument("--population", type=int, default=8)
    run.add_argument("--seeds", type=int, default=2, help="training seeds per generation")
    run.add_argument("--validation-seeds", type=int, default=4)
    run.add_argument("--sigma", type=float, default=0.15)
    run.add_argument("--seed", type=int, default=42)
    run.add_argument("--max-hours", type=float, default=None)
    run.add_argument("--patience", type=int, default=None, help="stop after this many generations with no new champion")
    run.add_argument("--fresh", action="store_true", help="ignore any saved state and start over")

    show = sub.add_parser("show", help="print the champion and where the archive stands")
    show.add_argument("--archive", default="archive")

    args = parser.parse_args(argv)
    if args.command == "show":
        state_file = Path(args.archive) / "state.json"
        if not state_file.exists():
            print(f"no archive at {args.archive}")
            return 1
        state = json.loads(state_file.read_text())
        print(f"generations completed: {state['next_generation']}")
        print(f"champion (held-out score {state['champion_validation']}):")
        print(json.dumps(state["champion"], indent=2))
        return 0

    evolver = Evolver(
        load_problem(args.problem), args.archive, population=args.population, seeds_per_generation=args.seeds,
        validation_seeds=args.validation_seeds, rng_seed=args.seed, sigma=args.sigma,
    )
    state = evolver.run(args.generations, max_hours=args.max_hours, patience=args.patience, resume=not args.fresh)
    print(f"done: {state['next_generation']} generations. champion:\n{json.dumps(state['champion'], indent=2)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
