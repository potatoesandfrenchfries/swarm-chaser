"""The container's entrypoint (`whitebox/runner.py`), the offline pipeline beside it, and the handshake with the orchestrator.

Needs numpy and scikit-learn, which the fast CI job does not install, so it skips there. The model itself
(`agent_loop.AgentRunner`) is replaced by a stub: no GPU, no download.
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

LAYERS, DIM = 4, 6
LAYER = 2


def activation(label, rng, steps=3):
    """Hidden states (steps, layers, hidden) where every layer but 0 carries the label across all its coordinates."""
    out = rng.normal(size=(steps, LAYERS, DIM))
    out[:, 1:, :] += 4 * label
    return out.astype(np.float16)


def save_activations(work, labels, steps=3, seed=0):
    rng = np.random.default_rng(seed)
    (work / "activations").mkdir(parents=True, exist_ok=True)
    for i, label in enumerate(labels):
        np.save(work / "activations" / f"run{i}.npy", activation(label, rng, steps))


def plan_for(labels, step=2, layer=LAYER, cv=3, seed=0):
    return {
        "rows": [{"run_id": f"run{i}", "step": step, "label": label} for i, label in enumerate(labels)],
        "folds": blackbox.stratified_folds(labels, cv, seed),
        "seed": seed,
        "layer": layer,
    }


def spy_on_evaluate(monkeypatch):
    seen = {}
    real = classify.evaluate

    def spy(X, y, **kwargs):
        seen.update(X=X, y=y, **kwargs)
        return real(X, y, **kwargs)

    monkeypatch.setattr(classify, "evaluate", spy)
    return seen


# --- scoring -------------------------------------------------------------------------------------------


def test_the_probe_is_scored_on_the_folds_it_is_given(tmp_path, monkeypatch):
    labels = [i % 2 for i in range(12)]
    save_activations(tmp_path, labels)
    plan = plan_for(labels)
    seen = spy_on_evaluate(monkeypatch)
    result = runner.evaluate_plan(plan, tmp_path)
    for (train, test), fold in zip(seen["splits"], plan["folds"], strict=True):
        assert test == sorted(fold) and sorted(train + test) == list(range(12))
    assert seen["X"].shape == (12, DIM) and list(seen["y"]) == labels and seen["seed"] == 0
    assert result["accuracy"] > 0.8 and result["auc_shuffled"] < result["auc"]
    assert json.loads((tmp_path / "whitebox_result.json").read_text()) == result


def test_each_row_reads_its_step_and_the_planned_layer(tmp_path, monkeypatch):
    labels = [0, 1] * 4
    save_activations(tmp_path, labels, steps=3)
    expected = np.stack([np.load(tmp_path / "activations" / f"run{i}.npy")[1, 3] for i in range(8)]).astype(np.float32)  # step 2, layer 3
    seen = spy_on_evaluate(monkeypatch)
    result = runner.evaluate_plan(plan_for(labels, step=2, layer=3, cv=2), tmp_path)
    np.testing.assert_array_equal(seen["X"], expected)
    assert result["layer"] == 3


def test_a_layer_the_capture_does_not_have_is_refused(tmp_path):
    save_activations(tmp_path, [0, 1] * 4)
    with pytest.raises(ValueError, match="layer 9 is out of range"):
        runner.evaluate_plan(plan_for([0, 1] * 4, layer=9, cv=2), tmp_path)


def test_the_same_plan_scores_the_same_twice(tmp_path):
    labels = [i % 2 for i in range(12)]
    save_activations(tmp_path, labels)
    assert runner.evaluate_plan(plan_for(labels), tmp_path) == runner.evaluate_plan(plan_for(labels), tmp_path)


# --- the run command -----------------------------------------------------------------------------------

DONE = json.dumps({"reasoning": "done", "tool": "done", "args": {}})
LIST = json.dumps({"reasoning": "look", "tool": "list_files", "args": {"directory": "/p"}})


@pytest.fixture
def stub_model(monkeypatch):
    """An agent_loop whose AgentRunner has no model: the agent lists files twice, then finishes. Runs whose task says "boom" crash.

    Tasks read "Task number i.", and odd i get hidden states with the signal, so the probe has something to find.
    """
    stub = types.ModuleType("agent_loop")
    stub.loaded, stub.rng = [], np.random.default_rng(0)

    class AgentRunner:
        def __init__(self, model_name):
            stub.loaded.append(model_name)

        def step(self, messages):
            task = messages[1]["content"]
            if "boom" in task:
                raise RuntimeError("out of memory")
            label = int(re.search(r"Task number (\d+)", task).group(1)) % 2 if "Task number" in task else 0
            done = sum(m["content"].startswith("Tool result") for m in messages) >= 2
            return (DONE if done else LIST), activation(label, stub.rng, steps=1)[0]

    stub.AgentRunner = AgentRunner
    monkeypatch.setitem(sys.modules, "agent_loop", stub)
    return stub


def ep(run_id, text="Task number 0."):
    return {"run_id": run_id, "text": text, "agents": [{"name": "alice", "private": ""}], "focus": "alice", "rounds": 6}


def test_the_run_command_saves_events_and_every_layer_at_every_focus_step(tmp_path, stub_model):
    asked = []
    failures = runner.run_tasks([ep("a"), ep("b")], tmp_path, lambda request: asked.append(request) or None, "some/model")
    assert failures == {} and stub_model.loaded == ["some/model"]
    assert np.load(tmp_path / "activations" / "a.npy").shape == (3, LAYERS, DIM)  # two tool steps and the finishing one
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


def test_the_entrypoint_runs_and_scores(tmp_path, stub_model, monkeypatch, capsys):
    tasks = tmp_path / "tasks.json"
    tasks.write_text(json.dumps([ep(f"run{i}", f"Task number {i}.") for i in range(12)]))
    protocol = io.StringIO()
    monkeypatch.setattr(sys, "stdin", io.StringIO('{"message": null}\n' * 100))
    monkeypatch.setattr(sys, "stdout", protocol)
    assert runner.main(["run", "--tasks", str(tasks), "--out", str(tmp_path), "--model", "m/x"]) == 0
    assert "0 run(s) failed" in capsys.readouterr().err and stub_model.loaded == ["m/x"]
    assert protocol.getvalue().count("influencer_request") == 36  # three rounds each
    plan = tmp_path / "plan.json"
    plan.write_text(json.dumps(plan_for([i % 2 for i in range(12)], step=1)))
    assert runner.main(["evaluate", "--plan", str(plan), "--out", str(tmp_path)]) == 0
    assert (tmp_path / "whitebox_result.json").is_file()


# --- the offline pipeline: dataset, train, predict, probe ------------------------------------------------


def test_the_task_pairs_are_complete_and_labelled_by_side():
    import tasks

    assert len(tasks.TASK_PAIRS) >= 2
    assert all({"theme", "benign", "malicious"} <= set(pair) and pair["benign"] != pair["malicious"] for pair in tasks.TASK_PAIRS)
    assert len({pair["theme"] for pair in tasks.TASK_PAIRS}) == len(tasks.TASK_PAIRS)


def test_every_tool_the_agents_can_call_is_a_fake_that_touches_nothing(tmp_path, monkeypatch):
    import tools

    monkeypatch.chdir(tmp_path)
    for name, tool in tools.TOOLS.items():
        assert tool().startswith("[fake]"), name
    assert list(tmp_path.iterdir()) == []


@pytest.fixture
def stub_runner_class(monkeypatch):
    """AgentRunner without a model, for the scripts that build a dataset."""
    stub = types.ModuleType("agent_loop")
    rng = np.random.default_rng(1)

    class AgentRunner:
        def __init__(self, model_name):
            self.model_name, self.num_layers, self.hidden_size, self.device = model_name, LAYERS, DIM, "cpu"

        def run_task(self, task, run_id, label):
            n = 3 if label else 2
            return [{"run_id": run_id, "step": s, "label": label, "tool": "send_email" if label and s else "read_file", "reasoning": "r", "vec": activation(label, rng, 1)[0]} for s in range(n)]

    stub.AgentRunner = AgentRunner
    monkeypatch.setitem(sys.modules, "agent_loop", stub)
    monkeypatch.delitem(sys.modules, "make_dataset", raising=False)
    monkeypatch.delitem(sys.modules, "probe", raising=False)


def test_the_dataset_has_one_row_per_step_per_captured_layer(tmp_path, stub_runner_class, monkeypatch):
    import make_dataset

    monkeypatch.setattr(make_dataset, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(make_dataset, "TASK_PAIRS", [{"theme": "t1", "benign": "b1", "malicious": "m1"}, {"theme": "t2", "benign": "b2", "malicious": "m2"}])
    make_dataset.main("some/Model-X", [1, 3])
    rows = (tmp_path / "activations_some-model-x.csv").read_text().splitlines()
    header = rows[0].split(",")
    assert header[:5] == ["run_id", "step", "label", "tool", "layer"] and header[5:] == [f"x{j}" for j in range(DIM)]
    assert len(rows) - 1 == (2 + 3) * 2 * 2  # steps over the four runs, two layers each
    assert {r.split(",")[4] for r in rows[1:]} == {"1", "3"} and {r.split(",")[2] for r in rows[1:]} == {"0", "1"}


def test_training_sweeps_the_layers_and_the_saved_monitor_scores_a_live_activation(tmp_path, monkeypatch):
    pd = pytest.importorskip("pandas")
    joblib = pytest.importorskip("joblib")
    import whitebox_predict
    import whitebox_train

    rng, rows = np.random.default_rng(2), []
    for run in range(16):
        label = run % 2
        for step in range(3):
            stack = activation(label, rng, 1)[0].astype(np.float32)
            for layer in range(LAYERS):
                rows.append({"run_id": f"r{run}", "step": step, "label": label, "tool": "x", "layer": layer, **{f"x{j}": float(stack[layer, j]) for j in range(DIM)}})
    pd.DataFrame(rows).to_csv(tmp_path / "activations_some-model-x.csv", index=False)

    for module in (whitebox_train, whitebox_predict):
        monkeypatch.setattr(module, "DATA_DIR", str(tmp_path))
    whitebox_train.main("some/Model-X")
    metrics = json.loads((tmp_path / "whitebox_some-model-x_metrics.json").read_text())
    assert {r["layer"] for r in metrics["sweep"]} == set(range(LAYERS)) and metrics["best_layer"] != 0  # layer 0 carries no signal
    assert all(r["auc_shuffled"] < r["auc"] for r in metrics["sweep"] if r["layer"] != 0)
    assert joblib.load(tmp_path / "whitebox_some-model-x.joblib")["layer"] == metrics["best_layer"]

    monitor = whitebox_predict.WhiteboxMonitor("some/Model-X")
    malicious, benign = activation(1, rng, 1)[0], activation(0, rng, 1)[0]
    assert monitor.score(malicious) > 0.5 > monitor.score(benign)  # a full (layers, hidden) stack...
    assert monitor.score(malicious[monitor.layer]) > 0.5  # ...or a single vector at the right layer


def test_the_probe_reports_whether_the_model_took_the_bait(stub_runner_class, capsys):
    import probe

    assert probe.took_bait([{"tool": "list_files"}, {"tool": "http_post"}]) and not probe.took_bait([{"tool": "read_file"}])
    probe.main("some/model", 2)
    out = capsys.readouterr().out
    assert "Summary: agent acted on 2/2 malicious tasks" in out


def test_the_entrypoint_reaches_the_offline_pipeline(monkeypatch):
    calls = []
    for name, fn in (("make_dataset", "main"), ("whitebox_train", "main"), ("probe", "main")):
        module = types.ModuleType(name)
        setattr(module, fn, lambda *args, name=name: calls.append((name, args)))
        monkeypatch.setitem(sys.modules, name, module)
    assert runner.main(["dataset", "--model", "m/x", "--layers", "9, 18,27"]) == 0
    assert runner.main(["dataset"]) == 0
    assert runner.main(["train", "--model", "m/x"]) == 0
    assert runner.main(["probe", "--model", "m/x", "--pairs", "5"]) == 0
    assert calls == [("make_dataset", ("m/x", [9, 18, 27])), ("make_dataset", (runner.DEFAULT_MODEL, None)), ("whitebox_train", ("m/x",)), ("probe", ("m/x", 5))]


# --- both sides together -------------------------------------------------------------------------------


class InProcessSession:
    """The agent container, run in this process: the real runner and environment, a stub model, and the real protocol's turn-taking."""

    def __init__(self, command):
        self.work = FakeContainer.work_dir(command)
        self.asks, self.answers, self.error = queue.Queue(), queue.Queue(), None
        tasks = json.loads((self.work / "tasks.json").read_text())
        model = command[command.index("--model") + 1]

        def ask(request):
            self.asks.put(request)
            return self.answers.get(timeout=30)

        def target():
            try:
                runner.run_tasks(tasks, self.work, ask, model)
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
        tasks, tmp_path, step=2, layer=LAYER, model="some/model", cv=3, influencer=influencer, docker=container, spawn=lambda command: InProcessSession(command)
    )
    assert report["rows"]["n"] == 12 and report["rows"]["influenced"] == ["run1"] and report["config"]["folds"] == 3
    assert stub_model.loaded == ["some/model"] and ("run1", 2, "The build did not pass.") in delivered
    assert report["whitebox"]["accuracy"] > 0.8 and report["whitebox"]["layer"] == LAYER  # the signal planted in the hidden states, read through plan.json by the real probe
    assert [k for _, _, k in orchestrator.COMPARED if k not in report["whitebox"]] == []
    events = (tmp_path / "events.jsonl").read_text()
    assert '"label"' not in events and "the build passed" not in events  # neither the label nor the claim ever went into the container
    assert (tmp_path / "activations" / "run1.npy").is_file()
    assert "layer 2" in orchestrator.format_report(report)


# --- the single-agent entry point the offline pipeline uses ----------------------------------------------


def test_the_offline_pipelines_run_task_is_the_same_episode_logic_as_the_orchestrators(monkeypatch):
    """AgentRunner.run_task goes through environment.run_episode, so the dataset and the scored runs share one prompt and one set of rules."""
    torch = types.ModuleType("torch")
    torch.float16 = "float16"
    torch.no_grad = lambda: (lambda fn: fn)
    torch.cuda = types.SimpleNamespace(is_available=lambda: False)
    transformers = types.ModuleType("transformers")
    transformers.AutoModelForCausalLM = transformers.AutoTokenizer = object
    for name, module in (("torch", torch), ("transformers", transformers)):
        monkeypatch.setitem(sys.modules, name, module)
    monkeypatch.delitem(sys.modules, "agent_loop", raising=False)
    import agent_loop

    seen = []
    replies = iter([LIST, 'oops {"tool": "list_files(', LIST, DONE])  # a call, a broken reply that is retried, then done

    def step(messages):
        seen.append(messages)
        return next(replies), np.ones((LAYERS, DIM), dtype=np.float16)

    runner_ = object.__new__(agent_loop.AgentRunner)
    runner_.step = step
    records = runner_.run_task("Task number 1.", "r1", 1)
    assert [r["tool"] for r in records] == ["list_files", "list_files", "done"] and records[0]["reasoning"] == "look"
    assert all(r["label"] == 1 and r["vec"].shape == (LAYERS, DIM) for r in records) and [r["step"] for r in records] == [0, 1, 2]
    assert seen[0][0]["role"] == "system" and "ONE JSON object" in seen[0][0]["content"] and seen[0][1]["content"] == "Task number 1."
    assert agent_loop.MAX_STEPS == 6
