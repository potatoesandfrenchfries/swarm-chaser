"""Fetch a seeded sample of ScaleAI/mrt into git-ignored `local/mrt/` (stress test, see STRESSTEST.md).

Kept outside `src/` because it uses the network (tests/test_pipeline_contract.py forbids that in `src/`).

    uv run python adapters/mrt.py local/mrt --per-task 20 --seed 0

The dataset is CC BY-NC 4.0: research use only, cite Kale et al. 2025 ("Reliable Weak-to-Strong Monitoring of
LLM Agents"). Its card says not to train generative models on it and carries a canary string; this project
fits only a small logistic regression on numeric features and never copies transcript text into the repo.
Files are public, so no token is needed.
"""
import argparse
import json
import random
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

DATASET = "ScaleAI/mrt"
LISTING_URL = f"https://huggingface.co/api/datasets/{DATASET}"
FILE_URL = f"https://huggingface.co/datasets/{DATASET}/resolve/main/"


def list_transcripts(timeout: int = 120) -> list[str]:
    """Every `transcript_<n>.json` path in the dataset."""
    with urllib.request.urlopen(LISTING_URL, timeout=timeout) as response:
        siblings = json.load(response)["siblings"]
    return sorted(s["rfilename"] for s in siblings if s["rfilename"].rsplit("/", 1)[-1].startswith("transcript_") and s["rfilename"].endswith(".json"))


def sample(paths: list[str], per_task: int, seed: int) -> list[str]:
    """Up to `per_task` paths from each task (`<root>/<task>/...`), chosen with a seeded generator."""
    by_task = defaultdict(list)
    for path in paths:
        root, task = path.split("/")[:2]
        by_task[(root, task)].append(path)
    rng = random.Random(seed)
    chosen = []
    for key in sorted(by_task):
        group = sorted(by_task[key])
        chosen.extend(rng.sample(group, min(per_task, len(group))))
    return sorted(chosen)


def fetch(path: str, out_dir: Path, retries: int = 3, timeout: int = 60) -> bool:
    """Download one file unless it is already there. Returns False if every attempt failed."""
    target = out_dir / path
    if target.exists():
        return True
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + ".part")
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(FILE_URL + path, timeout=timeout) as response:
                partial.write_bytes(response.read())
            partial.rename(target)
            return True
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(2 * (attempt + 1))
    return False


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("out_dir", type=Path)
    parser.add_argument("--per-task", type=int, default=20)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--roots", nargs="+", default=None, help="only these top-level folders, e.g. task_pairs (the only one with a side-task outcome)")
    args = parser.parse_args(argv)

    paths = [p for p in list_transcripts() if args.roots is None or p.split("/")[0] in args.roots]
    chosen = sample(paths, args.per_task, args.seed)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "sample.json").write_text(json.dumps(chosen, indent=1))
    failed = []
    for i, path in enumerate(chosen, 1):
        if not fetch(path, args.out_dir):
            failed.append(path)
        print(f"\r{i}/{len(chosen)}", end="", file=sys.stderr)
    print(f"\nfetched {len(chosen) - len(failed)} of {len(chosen)}; failed: {failed[:5]}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
