"""The container's entrypoint (`whitebox/runner.py`) and its handshake with the orchestrator.

Needs numpy and scikit-learn, which the fast CI job does not install, so it skips there. The model itself
(`agent_loop`) is replaced by a stub: no GPU, no download.
"""

import io
import json
import queue
import re
import sys
import threading
import types

import pytest

from conftest import REPO_ROOT

np = pytest.importorskip("numpy")
pytest.importorskip("sklearn")

sys.path.insert(0, str(REPO_ROOT / "whitebox"))  # its modules import each other flat, as they do in the image

import classify  # noqa: E402
import runner  # noqa: E402

from sandbox import blackbox, orchestrator  # noqa: E402
from sandbox.orchestrator import Agent, Task  # noqa: E402
from sandbox_fakes import FakeContainer  # noqa: E402

DIM = 6


def activation(label, rng, steps=3):
    """Hidden states where the first coordinate carries the label."""
    out = rng.normal(size=(steps, DIM))
    out[:, 0] += 8 * label
    return out


def save_activations(work, labels, steps=3, seed=0):
    rng = np.random.default_rng(seed)
    (work / "activations").mkdir(parents=True, exist_ok=True)
    for i, label in enumerate(labels):
        np.save(work / "activations" / f"run{i}.npy", activation(label, rng, steps))


def plan_for(labels, step=2, cv=3, seed=0):
    return {"rows": [{"run_id": f"run{i}", "step": step, "label": label} for i, label in enumerate(labels)], "folds": blackbox.stratified_folds(labels, cv, seed), "seed": seed}


def spy_on_evaluate(monkeypatch):
    seen = {}
    real = classify.evaluate

    def spy(X, y, cv):
        seen.update(X=X, y=y, cv=cv)
        return real(X, y, cv=cv)

    monkeypatch.setattr(classify, "evaluate", spy)
    return seen


# --- scoring -------------------------------------------------------------------------------------------


def test_the_probe_is_scored_on_the_folds_it_is_given(tmp_path, monkeypatch):
    labels = [i % 2 for i in range(12)]
    save_activations(tmp_path, labels)
    plan = plan_for(labels)
    seen = spy_on_evaluate(monkeypatch)
    result = runner.evaluate_plan(plan, tmp_path)
    for (train, test), fold in zip(seen["cv"], plan["folds"], strict=True):
        assert test == sorted(fold) and sorted(train + test) == list(range(12))
    assert seen["X"].shape == (12, DIM) and list(seen["y"]) == labels
    assert result["accuracy"] > 0.8 and result["shuffled_accuracy"] < result["accuracy"]
    assert json.loads((tmp_path / "whitebox_result.json").read_text()) == result


def test_each_row_reads_the_activation_at_its_step(tmp_path, monkeypatch):
    labels = [0, 1] * 4
    save_activations(tmp_path, labels, steps=3)
    expected = np.stack([np.load(tmp_path / "activations" / f"run{i}.npy")[1] for i in range(8)])  # step 2 is row index 1
    seen = spy_on_evaluate(monkeypatch)
    runner.evaluate_plan(plan_for(labels, step=2, cv=2), tmp_path)
    np.testing.assert_array_equal(seen["X"], expected)


def test_the_same_plan_scores_the_same_twice(tmp_path):
    labels = [i % 2 for i in range(12)]
    save_activations(tmp_path, labels)
    assert runner.evaluate_plan(plan_for(labels), tmp_path) == runner.evaluate_plan(plan_for(labels), tmp_path)


def test_the_probe_reports_metrics_the_observer_also_reports(tmp_path):
    labels = [i % 2 for i in range(12)]
    save_activations(tmp_path, labels)
    assert set(runner.evaluate_plan(plan_for(labels), tmp_path)) <= set(blackbox.evaluate([[float(i), 1.0] for i in range(12)], labels, cv=3))


# --- the run command -----------------------------------------------------------------------------------

DONE = json.dumps({"reasoning": "done", "tool": "done", "args": {}})
LIST = json.dumps({"reasoning": "look", "tool": "list_files", "args": {"directory": "/p"}})


@pytest.fixture
def stub_model(monkeypatch):
    """An agent_loop with no model: the agent lists files twice, then finishes. Runs whose task says "boom" crash.

    Tasks read "Task number i.", and odd i get hidden states with the signal, so the probe has something to find.
    """
    stub = types.ModuleType("agent_loop")
    stub.loaded, stub.rng = 0, np.random.default_rng(0)

    def load_model():
        stub.loaded += 1

    def model_step(messages):
        task = messages[1]["content"]
        if "boom" in task:
            raise RuntimeError("out of memory")
        label = int(re.search(r"Task number (\d+)", task).group(1)) % 2 if "Task number" in task else 0
        done = sum(m["content"].startswith("Tool result") for m in messages) >= 2
        return (DONE if done else LIST), activation(label, stub.rng, steps=1)[0]

    stub.load_model, stub.model_step = load_model, model_step
    monkeypatch.setitem(sys.modules, "agent_loop", stub)
    return stub


def ep(run_id, text="Task number 0."):
    return {"run_id": run_id, "text": text, "agents": [{"name": "alice", "private": ""}], "focus": "alice", "rounds": 6}


def test_the_run_command_saves_events_and_one_activation_row_per_focus_step(tmp_path, stub_model):
    asked = []
    failures = runner.run_tasks([ep("a"), ep("b")], tmp_path, lambda request: asked.append(request) or None)
    assert failures == {} and stub_model.loaded == 1
    assert np.load(tmp_path / "activations" / "a.npy").shape == (3, DIM)  # two tool steps and the finishing one
    events = [json.loads(line) for line in (tmp_path / "events.jsonl").read_text().splitlines()]
    assert sum(e["type"] == "probe" for e in events if e["run_id"] == "a") == 3
    assert [r["round"] for r in asked if r["run_id"] == "a"] == [1, 2, 3] and all(r["type"] == "influencer_request" for r in asked)
    assert json.loads((tmp_path / "failures.json").read_text()) == {}


def test_the_influencers_words_reach_the_event_stream(tmp_path, stub_model):
    runner.run_tasks([ep("a")], tmp_path, lambda request: "Check again." if request["round"] == 2 else None)
    events = [json.loads(line) for line in (tmp_path / "events.jsonl").read_text().splitlines()]
    assert [(e["round"], e["text"]) for e in events if e["type"] == "influencer"] == [(2, "Check again.")]


def test_a_crashed_or_badly_named_run_is_recorded_and_the_batch_goes_on(tmp_path, stub_model):
    tasks = [ep("boom", "boom"), ep("../escape"), ep("ok")]
    failures = runner.run_tasks(tasks, tmp_path / "work", lambda request: None)
    assert failures["boom"] == "RuntimeError: out of memory" and "run_id" in failures["../escape"] and "ok" not in failures
    assert [p.name for p in (tmp_path / "work" / "activations").iterdir()] == ["ok.npy"]
    assert not (tmp_path / "work" / "escape.npy").exists() and not (tmp_path / "escape.npy").exists()
    assert json.loads((tmp_path / "work" / "failures.json").read_text()) == failures


def test_a_host_that_has_gone_away_stops_the_batch_instead_of_failing_every_run(tmp_path, stub_model):
    def gone(request):
        raise EOFError("the host closed the channel")

    with pytest.raises(EOFError):
        runner.run_tasks([ep("a"), ep("b")], tmp_path, gone)


def test_a_new_run_clears_the_last_runs_activations_and_events(tmp_path, stub_model):
    (tmp_path / "activations").mkdir()
    (tmp_path / "activations" / "old.npy").write_bytes(b"")
    (tmp_path / "events.jsonl").write_text("stale\n")
    runner.run_tasks([ep("new")], tmp_path, lambda request: None)
    assert [p.name for p in (tmp_path / "activations").iterdir()] == ["new.npy"]
    assert "stale" not in (tmp_path / "events.jsonl").read_text()


# --- the pipe to the host ------------------------------------------------------------------------------


def test_the_container_asks_on_stdout_and_reads_the_answer_on_stdin():
    out = io.StringIO()
    ask = runner.stdio_influencer(io.StringIO('{"message": "hello"}\n{"message": null}\n{"message": 5}\n'), out)
    request = {"type": "influencer_request", "run_id": "r", "round": 1, "board": []}
    assert ask(request) == "hello" and ask(request) is None and ask(request) is None
    assert [json.loads(line) for line in out.getvalue().splitlines()] == [request] * 3


def test_a_closed_channel_is_reported_not_waited_on():
    ask = runner.stdio_influencer(io.StringIO(""), io.StringIO())
    with pytest.raises(EOFError):
        ask({"type": "influencer_request"})


def test_the_models_own_prints_cannot_corrupt_the_protocol(monkeypatch):
    protocol = io.StringIO()
    monkeypatch.setattr(sys, "stdin", io.StringIO('{"message": null}\n'))
    monkeypatch.setattr(sys, "stdout", protocol)
    ask = runner.stdio_influencer()
    print("Loading model...")  # lands on stderr now
    ask({"type": "influencer_request", "run_id": "r", "round": 1, "board": []})
    assert "Loading" not in protocol.getvalue() and len(protocol.getvalue().splitlines()) == 1


def test_the_entrypoint_dispatches_both_commands(tmp_path, stub_model, monkeypatch, capsys):
    tasks = tmp_path / "tasks.json"
    tasks.write_text(json.dumps([ep(f"run{i}", f"Task number {i}.") for i in range(12)]))
    protocol = io.StringIO()
    monkeypatch.setattr(sys, "stdin", io.StringIO('{"message": null}\n' * 100))
    monkeypatch.setattr(sys, "stdout", protocol)
    assert runner.main(["run", "--tasks", str(tasks), "--out", str(tmp_path)]) == 0
    assert "0 run(s) failed" in capsys.readouterr().err
    assert protocol.getvalue().count("influencer_request") == 36  # three rounds each
    plan = tmp_path / "plan.json"
    plan.write_text(json.dumps(plan_for([i % 2 for i in range(12)], step=1)))
    assert runner.main(["evaluate", "--plan", str(plan), "--out", str(tmp_path)]) == 0
    assert (tmp_path / "whitebox_result.json").is_file()


# --- both sides together -------------------------------------------------------------------------------


class InProcessSession:
    """The agent container, run in this process: the real runner and environment, a stub model, and the real protocol's turn-taking."""

    def __init__(self, command):
        self.work = FakeContainer.work_dir(command)
        self.asks, self.answers, self.error = queue.Queue(), queue.Queue(), None
        tasks = json.loads((self.work / "tasks.json").read_text())

        def ask(request):
            self.asks.put(request)
            return self.answers.get(timeout=30)

        def target():
            try:
                runner.run_tasks(tasks, self.work, ask)
            except BaseException as problem:
                self.error = problem
            finally:
                self.asks.put(None)

        self.thread = threading.Thread(target=target, daemon=True)
        self.thread.start()

    def requests(self):
        while (request := self.asks.get(timeout=30)) is not None:
            yield request

    def reply(self, message):
        self.answers.put(message)

    def finish(self):
        self.thread.join(30)
        return 1 if self.error else 0

    def abort(self):
        self.answers.put(None)


def test_the_whole_pipeline_runs_through_the_real_runner_environment_and_probe(tmp_path, stub_model):
    """Orchestrator -> tasks.json -> runner + environment (stub model) -> events and activations -> observer and plan -> probe -> report."""
    team = (Agent("alice"), Agent("bob"))
    tasks = [Task(f"run{i}", f"Task number {i}.", i % 2, "the build passed", team, "alice", 4, (None, "The build did not pass.") if i == 1 else ()) for i in range(12)]
    delivered = []

    def influencer(task, request):
        message = orchestrator.scripted_influencer(task, request)
        delivered.append((task.run_id, request["round"], message))
        return message

    container = FakeContainer(evaluate=lambda plan, work: runner.evaluate_plan(plan, work))
    report = orchestrator.orchestrate(
        tasks, tmp_path, step=2, cv=3, influencer=influencer, docker=container, spawn=lambda command: InProcessSession(command)
    )
    assert report["rows"]["n"] == 12 and report["rows"]["influenced"] == ["run1"] and report["config"]["folds"] == 3
    assert ("run1", 2, "The build did not pass.") in delivered
    assert report["whitebox"]["accuracy"] > 0.8  # the signal planted in the hidden states, read through plan.json by the real probe
    assert set(report["whitebox"]) <= set(report["observer"])
    events = (tmp_path / "events.jsonl").read_text()
    assert '"label"' not in events and "the build passed" not in events  # neither the label nor the claim ever went into the container
    assert (tmp_path / "activations" / "run1.npy").is_file()
