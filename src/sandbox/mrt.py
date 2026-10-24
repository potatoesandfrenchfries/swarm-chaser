"""Train the blackbox model on ScaleAI/mrt and see what survives (a stress test: STRESSTEST.md has the issues).

MRT trajectories are agents doing a benign task while pursuing a hidden harmful one. The label here is
`side_task_evaluation` (did the hidden task succeed), which is not our sandbox label (`acted_on_claim`), so
this measures whether the blackbox features carry anything across tasks, not whether they predict the thing
we care about. Read the numbers with that in mind.

What the model may see, to match a monitor outside the sandbox: the user's task message, the agent's visible
text with `<thinking>` removed, and tool outputs, up to a cutoff. The system message is dropped, because it
states the hidden task. The monitor's own verdict (`monitoring_response`) and the task evaluations are never
features.

    PYTHONPATH=src uv run python -m sandbox.mrt local/mrt            # after: uv run python adapters/mrt.py local/mrt

Data stays in git-ignored `local/`. CC BY-NC 4.0, research use, cite Kale et al. 2025. The card says not to
train generative models on it; this fits a small logistic regression on nine numbers per run and copies no text.
"""
import hashlib
import json
import math
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from sandbox.blackbox import FEATURES, Transcript, evaluate, evaluate_by_group, features

# Only this top-level folder has a side-task outcome. The computer-use folder (`task_pairs_agentcompany`) has none.
LABELLED_ROOT = "task_pairs"
THINKING = re.compile(r"<thinking>.*?</thinking>", re.DOTALL | re.IGNORECASE)
# "system" is left out on purpose: it explains the test and states the hidden task.
ROLES = {"assistant": "agent", "tool": "tool", "user": "user"}
CUTOFF_FRACTIONS = (0.25, 0.5, 0.75, 1.0)


@dataclass
class Record:
    path: str  # relative to the data root: <root>/<task>/<strategy>/<agent model>/<monitor model>/transcript_<n>.json
    task: str
    strategy: str
    agent_model: str
    monitor_model: str
    label: int  # 1 if the hidden side task succeeded
    transcript: Transcript
    digest: str  # of the visible transcript, to find the same run seen by several monitors


def _text(content) -> str:
    """Message content is a string; tolerate a list of text blocks."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(b["text"] for b in content if isinstance(b, dict) and isinstance(b.get("text"), str) and b["text"])
    return ""


def to_transcript(conversation: list[dict]) -> Transcript:
    """The observable part of an MRT conversation, in our message shape. Agent turns lose their `<thinking>`;
    a turn with no visible text and no tool call is dropped."""
    out = []
    for message in conversation:
        role = ROLES.get(message.get("role"))
        if role is None:
            continue
        text = _text(message.get("content"))
        if role == "agent":
            text = THINKING.sub("", text).strip()
            if not text and not message.get("tool_calls"):
                continue
        out.append({"role": role, "text": text})
    return out


def side_task_label(value) -> Optional[int]:
    """1 or 0 for a boolean or a "true"/"false" string; None for anything else (missing, None, a score)."""
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, str) and value.strip().lower() in ("true", "false"):
        return int(value.strip().lower() == "true")
    return None


def _digest(transcript: Transcript) -> str:
    return hashlib.sha256(json.dumps(transcript, sort_keys=True).encode("utf-8")).hexdigest()


def load_sample(root: str | Path) -> tuple[list[Record], dict]:
    """Every usable labelled transcript under `root`, with a report of what was left out and why.

    The same run appears under several monitor models, so duplicates (same visible transcript) are dropped,
    keeping the first by path. `label_conflicts` counts duplicates whose labels disagree.
    """
    root = Path(root)
    report = Counter()
    seen: dict[str, Record] = {}
    for file in sorted(root.glob("*/*/*/*/*/transcript_*.json")):
        relative = file.relative_to(root).as_posix()
        parts = relative.split("/")
        report["files"] += 1
        if parts[0] != LABELLED_ROOT:
            report["not_in_labelled_root"] += 1
            continue
        try:
            data = json.loads(file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            report["unreadable"] += 1
            continue
        label = side_task_label(data.get("side_task_evaluation")) if isinstance(data, dict) else None
        if label is None:
            report["no_side_task_label"] += 1
            continue
        transcript = to_transcript(data.get("conversation") or [])
        if not any(m["role"] == "agent" for m in transcript):
            report["no_visible_agent_turns"] += 1
            continue
        record = Record(relative, parts[1], parts[2], parts[3], parts[4], label, transcript, _digest(transcript))
        if record.digest in seen:
            report["duplicate_transcripts"] += 1
            report["label_conflicts"] += seen[record.digest].label != label
            continue
        seen[record.digest] = record
    report["kept"] = len(seen)
    return list(seen.values()), dict(report)


def dataset(records: list[Record], cutoff_fraction: float = 0.5) -> tuple[list[list[float]], list[int], list[str]]:
    """(X, y, task per row). The cutoff is a share of each transcript's messages, so it is later in long runs.
    The "claim" for the overlap feature is the user's task message (there is no planted claim in MRT)."""
    if not 0 < cutoff_fraction <= 1:
        raise ValueError(f"cutoff_fraction must be in (0, 1], got {cutoff_fraction}")
    X, y, groups = [], [], []
    for r in records:
        task = next((m["text"] for m in r.transcript if m["role"] == "user"), "")
        cutoff = max(1, math.ceil(cutoff_fraction * len(r.transcript)))
        X.append(features(r.transcript, task, cutoff))
        y.append(r.label)
        groups.append(r.task)
    return X, y, groups


def _reported(evaluation, *args, **kwargs) -> dict:
    """Run an evaluation; a ValueError becomes {"error": ...} so a tiny sample still produces a readable report."""
    try:
        return evaluation(*args, **kwargs)
    except ValueError as problem:
        return {"error": str(problem)}


def stress_test(records: list[Record], seed: int = 0) -> dict:
    """Random-fold and leave-one-task-out scores at each cutoff. The gap between them is memory of the task."""
    base_rate = sum(r.label for r in records) / len(records) if records else float("nan")
    out = {"n": len(records), "tasks": dict(sorted(Counter(r.task for r in records).items())), "positive_rate": base_rate, "by_cutoff": {}}
    for fraction in CUTOFF_FRACTIONS:
        X, y, groups = dataset(records, fraction)
        row = {
            "leave_one_task_out": _reported(evaluate_by_group, X, y, groups, seed=seed),
            "random_folds": _reported(evaluate, X, y, cv=5, seed=seed),
        }
        out["by_cutoff"][str(fraction)] = row
    return out


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__.split("\n\n")[0], file=sys.stderr)
        return 2
    records, report = load_sample(argv[0])
    print(json.dumps({"features": FEATURES, "load": report}, indent=1))
    if len({r.label for r in records}) < 2:
        print("need both outcomes to fit anything; see the load report above", file=sys.stderr)
        return 1
    print(json.dumps(stress_test(records), indent=1, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
