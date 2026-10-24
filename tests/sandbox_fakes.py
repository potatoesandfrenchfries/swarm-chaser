"""A stand-in for the whitebox container, so the orchestrator can be tested without Docker, a GPU or a model."""

import json
from pathlib import Path
from typing import Callable, Optional

from sandbox.orchestrator import CONTAINER_WORK, REQUEST


def events_for(run_id: str, steps: int, finish: bool = True, text: str = "Tidy the project folder.", focus: str = "agent", said: Optional[dict[int, str]] = None, peer: bool = False) -> list[dict]:
    """The events whitebox/environment.py emits for one focus agent over `steps` rounds.

    `said` maps a round to what the influencer posted at its start; `peer` adds a second agent, "bob", who posts
    and calls a tool each round.
    """
    said = said or {}
    events = [{"run_id": run_id, "type": "task", "text": text, "focus": focus, "timestamp": "2025-01-01T00:00:00"}]
    for rnd in range(1, steps + 1):
        if rnd in said:
            events.append({"run_id": run_id, "round": rnd, "type": "influencer", "text": said[rnd], "timestamp": "t"})
        events.append({"run_id": run_id, "round": rnd, "type": "probe", "agent": focus, "step": rnd, "timestamp": "t"})
        events.append({"run_id": run_id, "round": rnd, "type": "reasoning", "agent": focus, "text": f"step {rnd}: I should verify the config first?", "timestamp": "t"})
        if rnd == steps and finish:
            events.append({"run_id": run_id, "round": rnd, "type": "finished", "agent": focus, "tool": "done", "timestamp": "t"})
        else:
            events.append({"run_id": run_id, "round": rnd, "type": "tool_call", "agent": focus, "tool": "list_files", "args": {"directory": f"/d{rnd}"}, "timestamp": "t"})
        if peer:
            events += [
                {"run_id": run_id, "round": rnd, "type": "reasoning", "agent": "bob", "text": "bob thinks privately", "timestamp": "t"},
                {"run_id": run_id, "round": rnd, "type": "board", "agent": "bob", "text": f"bob says {rnd}", "timestamp": "t"},
                {"run_id": run_id, "round": rnd, "type": "tool_call", "agent": "bob", "tool": "read_file", "args": {"path": "/b"}, "timestamp": "t"},
            ]
    return events


def touch_activations(path: Path) -> None:
    path.write_bytes(b"")  # the host only checks that the file exists; it never reads it


class FakeSession:
    """What the host sees of the agent container: it asks for the influencer once per round, and leaves its files in /work."""

    def __init__(self, container: "FakeContainer", command: list[str]):
        self.container, self.work = container, container.work_dir(command)
        self.aborted = False
        self.last_reply: Optional[str] = None

    def requests(self):
        c = self.container
        tasks = json.loads((self.work / "tasks.json").read_text())
        (self.work / "activations").mkdir(exist_ok=True)
        lines = []
        for task in tasks:
            run_id, n = task["run_id"], c.steps.get(task["run_id"], c.default_steps)
            if not n:
                continue
            said = {}
            for rnd in range(1, n + 1):
                request = {"type": REQUEST, "run_id": run_id, "round": rnd, "board": []}
                c.requests.append(request)
                yield request
                if self.last_reply:
                    said[rnd] = self.last_reply
            lines += [json.dumps(e) for e in events_for(run_id, n, said=said, text=task["text"], focus=task["focus"], peer=c.peer)]
            if run_id not in c.no_activations:
                c.write_activations(self.work / "activations" / f"{run_id}.npy")
        (self.work / "events.jsonl").write_text("\n".join(lines) + "\n")
        if c.failures is not None:
            (self.work / "failures.json").write_text(json.dumps(c.failures))

    def reply(self, message: Optional[str]) -> None:
        self.last_reply = message
        self.container.replies.append(message)

    def finish(self) -> int:
        return self.container.returncode

    def abort(self) -> None:
        self.aborted = True


class FakeContainer:
    """Stands in for Docker. `__call__` is `docker` (build, evaluate); `spawn` starts the agent container.

    `steps` maps a run_id to how many rounds the focus agent took (default 3); 0 means the run left no events at all.
    """

    def __init__(
        self,
        steps: Optional[dict[str, int]] = None,
        default_steps: int = 3,
        write_activations: Callable[[Path], None] = touch_activations,
        evaluate=None,
        failures=None,
        score: bool = True,
        peer: bool = False,
        returncode: int = 0,
    ):
        self.commands: list[list[str]] = []
        self.sessions: list[FakeSession] = []
        self.requests: list[dict] = []
        self.replies: list[Optional[str]] = []
        self.steps, self.default_steps = steps or {}, default_steps
        self.write_activations, self.evaluate, self.failures, self.score = write_activations, evaluate, failures, score
        self.peer, self.returncode = peer, returncode
        self.no_activations: set[str] = set()

    @staticmethod
    def work_dir(command: list[str]) -> Path:
        mount = command[command.index("-v") + 1]
        assert mount.endswith(f":{CONTAINER_WORK}")
        return Path(mount[: -len(f":{CONTAINER_WORK}")])

    def spawn(self, command: list[str]) -> FakeSession:
        self.commands.append(command)
        session = FakeSession(self, command)
        self.sessions.append(session)
        return session

    def __call__(self, command: list[str]) -> None:
        self.commands.append(command)
        if command[0] == "run" and self.score:
            work = self.work_dir(command)
            plan = json.loads((work / "plan.json").read_text())
            result = self.evaluate(plan, work) if self.evaluate else {"accuracy": 0.7, "auc": 0.8, "auc_shuffled": 0.5, "n": len(plan["rows"]), "folds": len(plan["folds"]), "layer": plan["layer"]}
            (work / "whitebox_result.json").write_text(json.dumps(result))
