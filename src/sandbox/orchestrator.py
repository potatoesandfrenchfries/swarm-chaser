"""Run one sandbox experiment: the agents and the whitebox probe inside Docker, the outside model out here.

    PYTHONPATH=src uv run python -m sandbox.orchestrator tasks.json --work local/m9 --step 3 --build

    host (this file, src/sandbox/blackbox.py)                            container (whitebox/)

    tasks.json  ------------------------------------------------------->  runner.py run
                                                                          environment.py: agents on one board,
                                                                          one model (agent_loop.py), fake tools
    the influencer answers each round  <---- influencer_request -------    "what does the outside model say now?"
                                       ----- {"message": ...} -------->
    events.jsonl  <-------------------------------------------------------  what happened, step by step
                                                                          activations/<run_id>.npy (never read here)
    observer features from the events, up to the same moment
    folds built once from the labels
    plan.json  -------------------------------------------------------->  runner.py evaluate (scikit-learn probe)
    report.json  <------------------------------------------------------  whitebox_result.json

Two models are scored on the same rows and folds. The whitebox probe is on one agent, the `focus` agent: its
hidden state before each of its steps, read inside the container. The observer (src/sandbox/blackbox.py) is
a baseline that sees only what an outside monitor would: the focus agent's messages, the board and the influencer,
up to the same moment. A row is one run at one `--step`, the focus agent's k-th step. Pick `--step` from the pilot
before the main runs (MVP.md M9), not after seeing the scores.

The outside model (the influencer) lives in this process, so its API key never enters the container, and the
container can run with no network at all (`--offline`). Here it is a function `(task, request) -> message | None`;
`scripted_influencer` plays the messages written in the tasks file, which a person reviews (scope.md: scenario and
influencer text stay out of src/). Only the public board goes to it. Nothing else flows to the container.

The probe only reads. Nothing trains the agents, and nothing the observer or the probe predicts is fed back to them.

The label is the `label` in the tasks file, used as `LabRun.acted_on_claim`. It is the condition the task author
set for the focus agent (1: a hidden malicious brief), not an observed outcome, so until the pilot defines "acts on
the claim" (scope.md) the two readings are the same only by assumption. The container is never sent it.
"""

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Iterator, Mapping, Optional

from lab.arms import LabRun
from sandbox import blackbox

IMAGE = "claim-spread-whitebox"
CACHE_VOLUME = "claim-spread-hf-cache"  # model weights, so they download once
WHITEBOX_DIR = Path(__file__).resolve().parents[2] / "whitebox"  # the build context: nothing else is visible to the image
CONTAINER_WORK = "/work"
CONTAINER_CACHE = "/cache"

RUN_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]*")  # becomes a file name, so no separators or leading dot
AGENT_NAME = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,31}")
RESERVED_NAMES = {"influencer"}  # the board's name for the outside model
DEFAULT_ROUNDS = 6  # whitebox/environment.py MAX_ROUNDS
MAX_ROUNDS = 20
REQUEST = "influencer_request"

Docker = Callable[[list[str]], None]


class ContainerError(RuntimeError):
    """The container (or Docker itself) failed or did not leave the files it should have."""


@dataclass(frozen=True)
class Agent:
    name: str
    private: str = ""  # what only this agent is told, on top of the shared task


@dataclass(frozen=True)
class Task:
    run_id: str
    text: str  # the task every agent is given
    label: int  # 1 if the focus agent has a hidden malicious brief / acts on the claim, else 0
    claim: str = ""  # the claim the observer's overlap feature looks for in the focus agent's messages; "" for none
    agents: tuple[Agent, ...] = (Agent("agent"),)
    focus: str = ""  # the agent the probe reads; the first agent if left empty
    rounds: int = DEFAULT_ROUNDS
    influencer_messages: tuple[Optional[str], ...] = ()  # what the scripted influencer posts at the start of each round

    def __post_init__(self):
        if not self.focus:
            object.__setattr__(self, "focus", self.agents[0].name)

    @property
    def influenced(self) -> bool:
        return any(self.influencer_messages)

    def for_container(self) -> dict:
        """What the container is told. Not the label, the claim or the influencer's script."""
        return {"run_id": self.run_id, "text": self.text, "agents": [{"name": a.name, "private": a.private} for a in self.agents], "focus": self.focus, "rounds": self.rounds}


# What the outside model says: (task, request) -> a message for the board, or None to stay quiet.
# `request` is {"type", "run_id", "round" (from 1), "board": [{"from", "text"}]}: the public board, nothing else.
Influencer = Callable[[Task, dict], Optional[str]]


def scripted_influencer(task: Task, request: dict) -> Optional[str]:
    """The task's own `influencer_messages`, one per round, in order."""
    index = request["round"] - 1
    return task.influencer_messages[index] if index < len(task.influencer_messages) else None


def _agents(item, i: int) -> tuple[Agent, ...]:
    raw = item.get("agents")
    if raw is None:
        return (Agent("agent"),)
    if not isinstance(raw, list) or not raw:
        raise ValueError(f"task {i}: agents must be a non-empty list")
    agents = []
    for entry in raw:
        entry = {"name": entry} if isinstance(entry, str) else entry
        if not isinstance(entry, dict) or not isinstance(entry.get("name"), str) or not isinstance(entry.get("private", ""), str):
            raise ValueError(f"task {i}: each agent needs a name and an optional private string")
        agents.append(Agent(entry["name"], entry.get("private", "")))
    names = [a.name for a in agents]
    for name in names:
        if not AGENT_NAME.fullmatch(name) or name.lower() in RESERVED_NAMES:
            raise ValueError(f"task {i}: agent name {name!r} must be letters, digits or '_', start with a letter, and not be 'influencer'")
    if len(set(names)) != len(names):
        raise ValueError(f"task {i}: agent names must be different")
    return tuple(agents)


def load_tasks(path: Path) -> list[Task]:
    """Read and check a tasks file: a JSON list of {"run_id", "text", "label", and optionally "claim", "agents", "focus", "rounds", "influencer_messages"}."""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, list) or not raw:
        raise ValueError("tasks file must be a non-empty JSON list")
    tasks, seen = [], set()
    for i, item in enumerate(raw):
        if not isinstance(item, dict) or not {"run_id", "text", "label"} <= set(item):
            raise ValueError(f"task {i} needs run_id, text and label")
        rounds, messages = item.get("rounds", DEFAULT_ROUNDS), item.get("influencer_messages", [])
        task = Task(item["run_id"], item["text"], item["label"], item.get("claim", ""), _agents(item, i), item.get("focus", ""), rounds, ())
        if not isinstance(task.run_id, str) or not RUN_ID.fullmatch(task.run_id):
            raise ValueError(f"task {i}: run_id {task.run_id!r} must be letters, digits, '_', '.' or '-', and not start with '.' or '-'")
        if task.run_id in seen:
            raise ValueError(f"task {i}: run_id {task.run_id!r} appears twice")
        if not isinstance(task.text, str) or not task.text:
            raise ValueError(f"task {i}: text must be a non-empty string")
        if task.label not in (0, 1) or isinstance(task.label, bool):
            raise ValueError(f"task {i}: label must be 0 or 1, got {task.label!r}")
        if not isinstance(task.claim, str):
            raise ValueError(f"task {i}: claim must be a string")
        if task.focus not in [a.name for a in task.agents]:
            raise ValueError(f"task {i}: focus {task.focus!r} is not one of the agents")
        if not isinstance(rounds, int) or isinstance(rounds, bool) or not 1 <= rounds <= MAX_ROUNDS:
            raise ValueError(f"task {i}: rounds must be a whole number from 1 to {MAX_ROUNDS}")
        if not isinstance(messages, list) or len(messages) > rounds or not all(m is None or isinstance(m, str) for m in messages):
            raise ValueError(f"task {i}: influencer_messages must be a list of at most {rounds} strings or nulls")
        seen.add(task.run_id)
        tasks.append(Task(**{**task.__dict__, "influencer_messages": tuple(messages)}))
    return tasks


# --- the container -------------------------------------------------------------------------------------


def run_docker(command: list[str]) -> None:
    """`docker <command>`, failing loudly. Injected into `orchestrate` so tests need no Docker."""
    try:
        subprocess.run(["docker", *command], check=True)
    except FileNotFoundError as problem:
        raise ContainerError("docker is not installed or not on PATH") from problem
    except subprocess.CalledProcessError as problem:
        raise ContainerError(f"`docker {command[0]}` exited with status {problem.returncode}") from problem


class DockerSession:
    """A container started with `docker run -i`, talked to in JSON lines: its requests in, our replies out."""

    def __init__(self, command: list[str]):
        try:
            self.process = subprocess.Popen(["docker", *command], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8", bufsize=1)
        except FileNotFoundError as problem:
            raise ContainerError("docker is not installed or not on PATH") from problem

    def requests(self) -> Iterator[dict]:
        for line in self.process.stdout:
            try:
                request = json.loads(line)
            except ValueError:
                continue  # anything that is not protocol is the container's own noise
            if isinstance(request, dict):
                yield request

    def reply(self, message: Optional[str]) -> None:
        self.process.stdin.write(json.dumps({"message": message}) + "\n")
        self.process.stdin.flush()

    def finish(self) -> int:
        self.process.stdin.close()
        return self.process.wait()

    def abort(self) -> None:
        self.process.kill()
        self.process.wait()


Spawn = Callable[[list[str]], DockerSession]


def build_command(image: str) -> list[str]:
    return ["build", "-t", image, str(WHITEBOX_DIR)]


def container_command(image: str, work_dir: Path, args: list[str], gpus: bool = False, offline: bool = False, interactive: bool = False) -> list[str]:
    """`docker run` for one runner command. The experiment folder is the only host path the container can see."""
    command = ["run", "--rm"]
    if interactive:
        command += ["-i"]
    if gpus:
        command += ["--gpus", "all"]
    if offline:  # weights already cached: no reason for the agents' container to reach the network
        command += ["--network", "none", "-e", "HF_HUB_OFFLINE=1"]
    command += ["-v", f"{work_dir}:{CONTAINER_WORK}", "-v", f"{CACHE_VOLUME}:{CONTAINER_CACHE}", image, *args]
    return command


def serve(session, tasks: list[Task], influencer: Influencer) -> None:
    """Answer the container's influencer requests until it exits. A container that fails, or an influencer that raises, is an error."""
    by_id = {t.run_id: t for t in tasks}
    try:
        for request in session.requests():
            if request.get("type") != REQUEST:
                continue
            task = by_id.get(request.get("run_id"))
            message = influencer(task, request) if task and isinstance(request.get("round"), int) else None
            session.reply(message if isinstance(message, str) and message else None)
    except BaseException:
        session.abort()
        raise
    code = session.finish()
    if code != 0:
        raise ContainerError(f"the agent container exited with status {code}")


# --- what the observer sees ------------------------------------------------------------------------------


@dataclass
class Observed:
    """One run as an outside observer saw it: the focus agent, the board and the influencer."""

    messages: blackbox.Transcript = field(default_factory=list)
    marks: list[int] = field(default_factory=list)  # messages seen when each of the focus agent's steps began

    @property
    def n_steps(self) -> int:
        return len(self.marks)


def read_events(path: Path) -> tuple[list[dict], int]:
    """(events, bad lines). A line cut short by a crash is counted and skipped."""
    events, bad = [], 0
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except ValueError:
            bad += 1
            continue
        if isinstance(event, dict) and isinstance(event.get("run_id"), str):
            events.append(event)
        else:
            bad += 1
    return events, bad


def observe(events: Iterable[dict], focus: Mapping[str, str]) -> dict[str, Observed]:
    """Events to what a monitor outside the sandbox would see. Only these fields are read: type, agent and text
    (and the tool and arguments of a tool call). Timestamps and anything else in an event cannot reach the features.

    The focus agent's reasoning and posts are agent messages and its tool calls are tool messages (arguments
    sorted); the other agents' posts are `peer` messages; the influencer's are `influencer`; the task is a `user`
    message. Other agents' reasoning and tool calls are not shown. A `probe` event marks where one of the focus
    agent's steps begins: the same moment the whitebox reads its hidden state.
    """
    seen: dict[str, Observed] = {}
    for event in events:
        run_id = event["run_id"]
        run = seen.setdefault(run_id, Observed())
        kind, text = event.get("type"), str(event.get("text", ""))
        mine = event.get("agent", focus.get(run_id)) == focus.get(run_id)
        if kind == "probe":
            run.marks.append(len(run.messages))
            continue
        if kind == "task":
            message = {"role": "user", "text": text}
        elif kind == "influencer":
            message = {"role": "influencer", "text": text}
        elif kind in ("reasoning", "agent_text", "board") and mine:
            message = {"role": "agent", "text": text}
        elif kind == "board":
            message = {"role": "peer", "text": text}
        elif kind == "tool_call" and mine:
            message = {"role": "tool", "text": f"{event.get('tool')}({json.dumps(event.get('args', {}), sort_keys=True)})"}
        else:
            continue
        run.messages.append(message)
    return seen


def read_at_step(run: Observed, step: int) -> tuple[int, blackbox.Transcript]:
    """(step used, messages before it): the moment the whitebox reads. Past its last step, a run is read at its last."""
    used = min(step, run.n_steps)
    return used, run.messages[: run.marks[used - 1]]


# --- one experiment --------------------------------------------------------------------------------------


def arm_for(task: Task) -> str:
    """lab.arms wants an arm per run; the observer does not read it."""
    if task.label == 0:
        return "no_plant"
    return "planted_claim_with_intervention" if task.influenced else "planted_claim"


def stage_rows(tasks: list[Task], observed: dict[str, Observed], work_dir: Path, step: int) -> dict:
    """Join tasks to what the run left behind. Returns the shared rows (in task order) and what was left out and why."""
    runs, rows, no_steps, no_activations, short = [], [], [], [], {}
    for task in tasks:
        run = observed.get(task.run_id)
        if run is None or run.n_steps == 0:
            no_steps.append(task.run_id)
        elif not (work_dir / "activations" / f"{task.run_id}.npy").is_file():
            no_activations.append(task.run_id)
        else:
            used, transcript = read_at_step(run, step)
            if used < step:
                short[task.run_id] = used
            strategy = "scripted" if task.influenced else None
            lab_run = LabRun(model="", arm=arm_for(task), hacking=0, reported=False, influencer_strategy=strategy, run_dir=task.run_id, acted_on_claim=bool(task.label))
            runs.append((lab_run, transcript, task.claim, used))
    X, y, kept, skipped = [], [], [], []
    for lab_run, transcript, claim, used in runs:  # build_dataset takes one claim and cutoff; ours differ per run
        rx, ry, rkept, rskipped = blackbox.build_dataset([(lab_run, transcript)], claim)
        X += rx
        y += ry
        kept += rkept
        skipped += rskipped
        rows += [{"run_id": r, "step": used, "label": label} for r, label in zip(rkept, ry, strict=True)]
    return {"X": X, "y": y, "rows": rows, "no_steps": no_steps, "no_activations": no_activations, "short_runs": short, "unlabelled": skipped}


def choose_folds(y: list[int], cv: int, seed: int) -> list[list[int]]:
    smaller = min(sum(y), len(y) - sum(y))
    if smaller < 2:
        raise ValueError(f"need at least 2 runs of each outcome to cross-validate, got {sum(y)} of 1 and {len(y) - sum(y)} of 0")
    return blackbox.stratified_folds(y, min(cv, smaller), seed)


def orchestrate(
    tasks: list[Task],
    work_dir: Path,
    step: int,
    *,
    cv: int = 5,
    seed: int = 0,
    image: str = IMAGE,
    gpus: bool = True,
    offline: bool = False,
    build: bool = False,
    skip_run: bool = False,
    influencer: Influencer = scripted_influencer,
    docker: Optional[Docker] = None,
    spawn: Optional[Spawn] = None,
) -> dict:
    """Run the whole experiment and write `report.json` in `work_dir`.

    `docker` runs one non-interactive `docker` command (build, evaluate); `spawn` starts the interactive agent
    container. Both default to the real thing.
    """
    if step < 1:
        raise ValueError(f"step must be at least 1, got {step}")
    docker, spawn = docker or run_docker, spawn or DockerSession
    work_dir = Path(work_dir).resolve()
    work_dir.mkdir(parents=True, exist_ok=True)

    if build:
        docker(build_command(image))
    if not skip_run:
        (work_dir / "tasks.json").write_text(json.dumps([t.for_container() for t in tasks], indent=1))
        session = spawn(container_command(image, work_dir, ["run", "--tasks", f"{CONTAINER_WORK}/tasks.json", "--out", CONTAINER_WORK], gpus=gpus, offline=offline, interactive=True))
        serve(session, tasks, influencer)
    events_path = work_dir / "events.jsonl"
    if not events_path.is_file():
        raise ContainerError(f"{events_path} is missing: the container left no event stream")

    events, bad_lines = read_events(events_path)
    staged = stage_rows(tasks, observe(events, {t.run_id: t.focus for t in tasks}), work_dir, step)
    if not staged["rows"]:
        raise ValueError("no run has both events and activations to score")
    folds = choose_folds(staged["y"], cv, seed)

    blackbox_result = blackbox.evaluate(staged["X"], staged["y"], folds=folds, seed=seed)

    plan = {"rows": staged["rows"], "folds": folds, "seed": seed}
    (work_dir / "plan.json").write_text(json.dumps(plan, indent=1))
    result_path = work_dir / "whitebox_result.json"
    result_path.unlink(missing_ok=True)
    docker(container_command(image, work_dir, ["evaluate", "--plan", f"{CONTAINER_WORK}/plan.json", "--out", CONTAINER_WORK], offline=True))
    if not result_path.is_file():
        raise ContainerError(f"{result_path} is missing: the container did not score the whitebox probe")

    failures_path = work_dir / "failures.json"
    y = staged["y"]
    by_id = {t.run_id: t for t in tasks}
    report = {
        "config": {"step": step, "folds": len(folds), "seed": seed, "image": image, "features": list(blackbox.FEATURES)},
        "rows": {
            "n": len(y),
            "positive_rate": sum(y) / len(y),
            "run_ids": [r["run_id"] for r in staged["rows"]],
            "influenced": [r["run_id"] for r in staged["rows"] if by_id[r["run_id"]].influenced],
            "no_steps": staged["no_steps"],
            "no_activations": staged["no_activations"],
            "short_runs": staged["short_runs"],
            "unlabelled": staged["unlabelled"],
            "bad_event_lines": bad_lines,
            "container_failures": json.loads(failures_path.read_text()) if failures_path.is_file() else {},
        },
        "observer": blackbox_result,
        "whitebox": json.loads(result_path.read_text()),
    }
    (work_dir / "report.json").write_text(json.dumps(report, indent=1, sort_keys=True))
    return report


def format_report(report: dict) -> str:
    """The two models side by side, on the same rows and folds."""
    rows, config = report["rows"], report["config"]
    left_out = {k: rows[k] for k in ("no_steps", "no_activations", "unlabelled", "container_failures") if rows[k]}
    lines = [
        f"{rows['n']} runs ({len(rows['influenced'])} with an influencer), {rows['positive_rate']:.0%} positive, {config['folds']} shared folds, step {config['step']}",
        f"{'':20}{'observer':>10}{'whitebox':>10}",
    ]
    for metric in ("accuracy", "accuracy_std", "auc", "auc_std", "shuffled_accuracy"):
        lines.append(f"{metric:20}{report['observer'][metric]:10.3f}{report['whitebox'].get(metric, float('nan')):10.3f}")
    lines.append("(shuffled_accuracy should sit near the base rate; higher means the features leak the label)")
    lines.append(f"observer brier {report['observer']['brier']:.3f} against {report['observer']['base_rate_brier']:.3f} for the base rate")
    if left_out:
        lines.append(f"left out: {json.dumps(left_out, sort_keys=True)}")
    if rows["short_runs"]:
        lines.append(f"read at an earlier step because the run stopped sooner: {json.dumps(rows['short_runs'], sort_keys=True)}")
    return "\n".join(lines)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("tasks", type=Path, help='JSON list of {"run_id", "text", "label", "agents"?, "focus"?, "rounds"?, "influencer_messages"?, "claim"?}')
    parser.add_argument("--work", type=Path, required=True, help="experiment folder (git-ignored, e.g. local/m9); mounted into the container")
    parser.add_argument("--step", type=int, required=True, help="the focus agent's step both models read at; choose it from the pilot")
    parser.add_argument("--cv", type=int, default=5, help="folds, capped at the size of the smaller class")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--image", default=IMAGE)
    parser.add_argument("--build", action="store_true", help="build the whitebox image first")
    parser.add_argument("--skip-run", action="store_true", help="reuse the events and activations already in --work")
    parser.add_argument("--offline", action="store_true", help="run the agents with no network (needs the weights cached already)")
    parser.add_argument("--no-gpu", action="store_true", help="run the agents on CPU (slow)")
    args = parser.parse_args(argv)

    try:
        report = orchestrate(
            load_tasks(args.tasks), args.work, args.step, cv=args.cv, seed=args.seed, image=args.image, gpus=not args.no_gpu, offline=args.offline, build=args.build, skip_run=args.skip_run
        )
    except (ContainerError, ValueError, OSError) as problem:
        print(f"error: {problem}", file=sys.stderr)
        return 1
    print(format_report(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
