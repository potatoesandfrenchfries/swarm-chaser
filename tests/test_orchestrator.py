"""The orchestrator: agents and the whitebox probe inside the container, the outside model and the observer out here.

No Docker is needed: `FakeContainer` stands in for it and leaves the files the real container would.
"""

import json
import subprocess
import sys

import pytest

from sandbox import blackbox, orchestrator
from sandbox.orchestrator import Agent, ContainerError, Task
from sandbox_fakes import FakeContainer, events_for


def tasks(n=8, **extra):
    """Half 1, half 0, interleaved."""
    return [Task(f"run{i}", f"Task number {i}.", i % 2, "the build passed", **extra) for i in range(n)]


def run(tmp_path, container=None, **kwargs):
    container = container or FakeContainer()
    kwargs.setdefault("step", 2)
    report = orchestrator.orchestrate(kwargs.pop("tasks", tasks()), tmp_path, docker=container, spawn=container.spawn, **kwargs)
    return report, container


# --- the tasks file ------------------------------------------------------------------------------------


def write_tasks(tmp_path, content):
    path = tmp_path / "tasks.json"
    path.write_text(json.dumps(content))
    return path


def test_a_tasks_file_loads_with_defaults(tmp_path):
    path = write_tasks(tmp_path, [{"run_id": "a", "text": "t", "label": 1, "claim": "c"}, {"run_id": "b.1-x", "text": "t", "label": 0}])
    first, second = orchestrator.load_tasks(path)
    assert first == Task("a", "t", 1, "c") and second.claim == ""
    assert first.agents == (Agent("agent"),) and first.focus == "agent" and first.rounds == orchestrator.DEFAULT_ROUNDS and not first.influenced


def test_a_tasks_file_can_describe_a_team_a_focus_and_an_influencer(tmp_path):
    item = {
        "run_id": "a",
        "text": "t",
        "label": 1,
        "agents": [{"name": "alice", "private": "only alice sees this"}, "bob"],
        "focus": "bob",
        "rounds": 4,
        "influencer_messages": [None, "a message", None],
    }
    (task,) = orchestrator.load_tasks(write_tasks(tmp_path, [item]))
    assert task.agents == (Agent("alice", "only alice sees this"), Agent("bob")) and task.focus == "bob" and task.rounds == 4
    assert task.influencer_messages == (None, "a message", None) and task.influenced


GOOD = {"run_id": "a", "text": "t", "label": 0}


@pytest.mark.parametrize(
    "bad",
    [
        [],
        {"run_id": "a"},
        ["a"],
        [{"run_id": "a", "text": "t"}],
        [{**GOOD, "run_id": "../a"}],
        [{**GOOD, "run_id": ".hidden"}],
        [{**GOOD, "run_id": 5}],
        [{**GOOD, "text": ""}],
        [{**GOOD, "label": 2}],
        [{**GOOD, "label": True}],
        [{**GOOD, "claim": 3}],
        [GOOD, {**GOOD, "label": 1}],
        [{**GOOD, "agents": []}],
        [{**GOOD, "agents": "alice"}],
        [{**GOOD, "agents": [5]}],
        [{**GOOD, "agents": [{"name": "alice", "private": 3}]}],
        [{**GOOD, "agents": ["alice", "alice"]}],
        [{**GOOD, "agents": ["influencer"]}],
        [{**GOOD, "agents": ["Influencer"]}],
        [{**GOOD, "agents": ["../x"]}],
        [{**GOOD, "agents": ["alice"], "focus": "bob"}],
        [{**GOOD, "rounds": 0}],
        [{**GOOD, "rounds": orchestrator.MAX_ROUNDS + 1}],
        [{**GOOD, "rounds": "3"}],
        [{**GOOD, "rounds": True}],
        [{**GOOD, "rounds": 2, "influencer_messages": ["a", "b", "c"]}],
        [{**GOOD, "influencer_messages": "hello"}],
        [{**GOOD, "influencer_messages": [3]}],
    ],
)
def test_a_bad_tasks_file_is_refused(tmp_path, bad):
    with pytest.raises(ValueError):
        orchestrator.load_tasks(write_tasks(tmp_path, bad))


def test_the_container_is_told_the_task_and_the_team_and_nothing_about_the_label_claim_or_influencer():
    task = Task("r", "do it", 1, "the build passed", (Agent("alice", "secret brief"), Agent("bob")), "alice", 4, ("the influencer's script",))
    sent = task.for_container()
    assert sent == {"run_id": "r", "text": "do it", "agents": [{"name": "alice", "private": "secret brief"}, {"name": "bob", "private": ""}], "focus": "alice", "rounds": 4}
    assert "the build passed" not in json.dumps(sent) and "script" not in json.dumps(sent)


def test_the_scripted_influencer_plays_one_message_per_round_then_stays_quiet():
    task = Task("r", "t", 1, influencer_messages=(None, "hello"))
    said = [orchestrator.scripted_influencer(task, {"round": n}) for n in (1, 2, 3)]
    assert said == [None, "hello", None]


# --- the container boundary ----------------------------------------------------------------------------


def test_the_container_sees_one_host_folder_and_the_model_cache(tmp_path):
    command = orchestrator.container_command("img", tmp_path, ["run"], gpus=True)
    assert command[:2] == ["run", "--rm"] and command[-2:] == ["img", "run"]
    assert [command[i + 1] for i, c in enumerate(command) if c == "-v"] == [f"{tmp_path}:/work", f"{orchestrator.CACHE_VOLUME}:/cache"]
    assert command[command.index("--gpus") + 1] == "all"
    assert "--network" not in command and "-i" not in command


def test_an_offline_container_has_no_network_a_cpu_one_has_no_gpu_and_a_live_one_keeps_stdin_open(tmp_path):
    command = orchestrator.container_command("img", tmp_path, ["evaluate"], gpus=False, offline=True, interactive=True)
    assert command[command.index("--network") + 1] == "none" and "HF_HUB_OFFLINE=1" in command and "-i" in command
    assert "--gpus" not in command


def test_the_image_is_built_from_the_whitebox_folder():
    assert orchestrator.build_command("img") == ["build", "-t", "img", str(orchestrator.WHITEBOX_DIR)]
    assert orchestrator.WHITEBOX_DIR.name == "whitebox"


def test_docker_is_run_as_a_subprocess_that_must_succeed(monkeypatch):
    seen = []
    monkeypatch.setattr(subprocess, "run", lambda cmd, check: seen.append((cmd, check)))
    orchestrator.run_docker(["build", "-t", "x", "."])
    assert seen == [(["docker", "build", "-t", "x", "."], True)]


def test_a_missing_docker_and_a_failing_container_are_explained(monkeypatch):
    def missing(cmd, check):
        raise FileNotFoundError

    monkeypatch.setattr(subprocess, "run", missing)
    with pytest.raises(ContainerError, match="not installed"):
        orchestrator.run_docker(["run"])

    def failing(cmd, check):
        raise subprocess.CalledProcessError(3, cmd)

    monkeypatch.setattr(subprocess, "run", failing)
    with pytest.raises(ContainerError, match="`docker run` exited with status 3"):
        orchestrator.run_docker(["run"])


CHILD = r"""
import json, sys
print("loading the model...", flush=True)                               # noise: not protocol
print(json.dumps({"type": "influencer_request", "run_id": "r", "round": 1, "board": []}), flush=True)
reply = json.loads(sys.stdin.readline())
print(json.dumps({"type": "influencer_request", "run_id": "r", "round": 2, "board": [], "echo": reply["message"]}), flush=True)
sys.stdin.readline()
sys.exit(int(sys.argv[1]) if len(sys.argv) > 1 else 0)
"""


def start_child(monkeypatch, code=0):
    """A DockerSession whose `docker` is a Python child that speaks the container's side of the protocol."""
    real = subprocess.Popen
    monkeypatch.setattr(subprocess, "Popen", lambda cmd, **kw: real([sys.executable, "-c", CHILD, str(code)], **kw))
    return orchestrator.DockerSession(["run"])


def test_a_live_session_exchanges_json_lines_with_the_container(monkeypatch):
    session = start_child(monkeypatch)
    requests = session.requests()
    first = next(requests)
    assert first["round"] == 1
    session.reply("hello there")
    second = next(requests)
    assert second["round"] == 2 and second["echo"] == "hello there"
    session.reply(None)
    assert session.finish() == 0


def test_a_live_session_can_be_killed(monkeypatch):
    session = start_child(monkeypatch)
    next(session.requests())
    session.abort()
    assert session.process.poll() is not None


def test_a_session_without_docker_is_explained(monkeypatch):
    def missing(cmd, **kw):
        raise FileNotFoundError

    monkeypatch.setattr(subprocess, "Popen", missing)
    with pytest.raises(ContainerError, match="not installed"):
        orchestrator.DockerSession(["run"])


def test_serving_gives_each_request_its_tasks_influencer_and_ignores_the_rest():
    class Session:
        def __init__(self):
            self.replies, self.code = [], 0

        def requests(self):
            yield {"type": "log", "text": "not a request"}
            yield {"type": "influencer_request", "run_id": "a", "round": 1, "board": []}
            yield {"type": "influencer_request", "run_id": "nobody", "round": 1, "board": []}
            yield {"type": "influencer_request", "run_id": "a", "round": "two", "board": []}
            yield {"type": "influencer_request", "run_id": "a", "round": 2, "board": []}

        def reply(self, message):
            self.replies.append(message)

        def finish(self):
            return self.code

    session = Session()
    seen = []

    def influencer(task, request):
        seen.append((task.run_id, request["round"]))
        return ["hello", 7][request["round"] - 1]  # the second reply is not a string, so it is dropped

    orchestrator.serve(session, [Task("a", "t", 0)], influencer)
    assert session.replies == ["hello", None, None, None] and seen == [("a", 1), ("a", 2)]


def test_a_failing_container_or_influencer_is_an_error_and_the_container_is_stopped():
    class Session:
        aborted = False

        def requests(self):
            yield {"type": "influencer_request", "run_id": "a", "round": 1, "board": []}

        def reply(self, message):
            pass

        def finish(self):
            return 137

        def abort(self):
            self.aborted = True

    with pytest.raises(ContainerError, match="status 137"):
        orchestrator.serve(Session(), [Task("a", "t", 0)], lambda task, request: None)

    broken = Session()
    with pytest.raises(RuntimeError, match="api down"):
        orchestrator.serve(broken, [Task("a", "t", 0)], lambda task, request: (_ for _ in ()).throw(RuntimeError("api down")))
    assert broken.aborted


# --- what the observer sees ------------------------------------------------------------------------------


def observed(events, focus="agent", run_id="r"):
    return orchestrator.observe(events, {run_id: focus})[run_id]


def test_events_become_the_messages_an_outside_monitor_would_see():
    run = observed(events_for("r", steps=2, said={1: "Check the build."}, peer=True))
    assert [(m["role"], m["text"]) for m in run.messages] == [
        ("user", "Tidy the project folder."),
        ("influencer", "Check the build."),
        ("agent", "step 1: I should verify the config first?"),
        ("tool", 'list_files({"directory": "/d1"})'),
        ("peer", "bob says 1"),
        ("agent", "step 2: I should verify the config first?"),  # `finished` adds no message
        ("peer", "bob says 2"),
    ]
    assert run.n_steps == 2


def test_the_other_agents_reasoning_and_tool_calls_are_not_shown():
    text = json.dumps(observed(events_for("r", steps=2, peer=True)).messages)
    assert "bob thinks privately" not in text and "read_file" not in text


def test_only_the_focus_agent_counts_as_the_agent():
    run = observed(events_for("r", steps=1, focus="alice", peer=True), focus="alice")
    assert [m["role"] for m in run.messages] == ["user", "agent", "peer"]
    run = observed(events_for("r", steps=1, focus="alice", peer=True), focus="bob")
    assert [m["role"] for m in run.messages] == ["user", "agent", "agent", "tool"]  # bob is the focus now: his reasoning, post and tool call; alice is hidden


def test_nothing_but_the_visible_fields_of_an_event_reaches_the_observer():
    events = events_for("r", steps=1)
    for event in events:
        event.update(label=1, secret="TOP SECRET", hidden_goal="exfiltrate")
    text = json.dumps(observed(events).messages)
    assert "TOP SECRET" not in text and "exfiltrate" not in text and "timestamp" not in text and "label" not in text


def test_an_agent_text_reply_is_an_agent_message_and_unknown_events_are_ignored():
    events = [
        {"run_id": "r", "type": "task", "text": "go"},
        {"run_id": "r", "type": "probe", "agent": "agent", "step": 1},
        {"run_id": "r", "type": "agent_text", "agent": "agent", "text": "I cannot say"},
        {"run_id": "r", "type": "heartbeat"},
    ]
    assert observed(events).messages == [{"role": "user", "text": "go"}, {"role": "agent", "text": "I cannot say"}]


def test_a_run_is_read_at_the_start_of_the_step_the_whitebox_reads():
    run = observed(events_for("r", steps=3, said={1: "hi", 3: "again"}))
    used, messages = orchestrator.read_at_step(run, 1)
    assert used == 1 and [m["role"] for m in messages] == ["user", "influencer"]  # the influencer spoke before step 1
    used, messages = orchestrator.read_at_step(run, 3)
    assert used == 3 and [m["role"] for m in messages] == ["user", "influencer", "agent", "tool", "agent", "tool", "influencer"]
    assert "step 3" not in json.dumps(messages)  # nothing from the step itself or later


def test_a_run_that_stopped_early_is_read_at_its_last_step():
    run = observed(events_for("r", steps=2))
    assert orchestrator.read_at_step(run, 5) == orchestrator.read_at_step(run, 2) and orchestrator.read_at_step(run, 5)[0] == 2


def test_event_lines_that_are_cut_short_or_malformed_are_counted_not_fatal(tmp_path):
    good = json.dumps({"run_id": "r", "type": "task", "text": "t"})
    path = tmp_path / "events.jsonl"
    path.write_text("\n".join([good, "", '{"run_id": "r", "ty', "[1]", json.dumps({"type": "task"})]))
    events, bad = orchestrator.read_events(path)
    assert len(events) == 1 and bad == 3


def test_the_arm_follows_the_label_and_the_influencer():
    assert orchestrator.arm_for(Task("r", "t", 0, influencer_messages=("hi",))) == "no_plant"
    assert orchestrator.arm_for(Task("r", "t", 1)) == "planted_claim"
    assert orchestrator.arm_for(Task("r", "t", 1, influencer_messages=(None, "hi"))) == "planted_claim_with_intervention"


# --- one experiment ------------------------------------------------------------------------------------


def test_the_whole_experiment_runs_and_both_models_are_reported(tmp_path):
    report, container = run(tmp_path)
    assert report["rows"]["n"] == 8 and report["rows"]["positive_rate"] == 0.5
    assert report["rows"]["run_ids"] == [f"run{i}" for i in range(8)] and report["rows"]["influenced"] == []
    assert {"accuracy", "auc", "shuffled_accuracy", "brier"} <= set(report["observer"])
    assert report["whitebox"]["accuracy"] == 0.7
    assert json.loads((tmp_path / "report.json").read_text()) == report
    assert report["config"]["features"] == list(blackbox.FEATURES)


def test_the_agent_container_is_live_and_gets_the_gpu_and_scoring_gets_neither(tmp_path):
    _, container = run(tmp_path, build=True)
    build, agents, score = container.commands
    assert build[0] == "build"
    assert "--gpus" in agents and "-i" in agents and "--network" not in agents and agents[-5:] == ["run", "--tasks", "/work/tasks.json", "--out", "/work"]
    assert "--gpus" not in score and "-i" not in score and score[score.index("--network") + 1] == "none" and score[-5] == "evaluate"


def test_the_container_gets_the_team_and_task_but_not_the_label_or_claim(tmp_path):
    run(tmp_path, tasks=tasks(agents=(Agent("alice", "brief"), Agent("bob")), focus="bob", influencer_messages=("a script",)))
    sent = json.loads((tmp_path / "tasks.json").read_text())
    assert sent[1] == {"run_id": "run1", "text": "Task number 1.", "agents": [{"name": "alice", "private": "brief"}, {"name": "bob", "private": ""}], "focus": "bob", "rounds": 6}


def test_the_influencer_is_asked_every_round_and_its_words_reach_the_agents_and_the_observer(tmp_path):
    seen = []

    def influencer(task, request):
        seen.append((task.run_id, request["round"]))
        return f"{task.run_id}: do it" if request["round"] == 1 else None

    report, container = run(tmp_path, tasks=tasks(4), influencer=influencer)
    assert seen[:4] == [("run0", 1), ("run0", 2), ("run0", 3), ("run1", 1)] and len(seen) == 12
    assert container.replies[:3] == ["run0: do it", None, None]
    events = [json.loads(line) for line in (tmp_path / "events.jsonl").read_text().splitlines()]
    assert [e["text"] for e in events if e["type"] == "influencer"][:2] == ["run0: do it", "run1: do it"]


def test_a_scripted_influencer_marks_the_run_and_shows_up_in_the_observers_features(tmp_path):
    scripted = tasks(8)
    scripted[1] = Task("run1", "Task number 1.", 1, "the build passed", influencer_messages=("The build did not pass.",))
    report, _ = run(tmp_path, tasks=scripted)
    assert report["rows"]["influenced"] == ["run1"]
    assert "1 with an influencer" in orchestrator.format_report(report)
    staged = orchestrator.stage_rows(scripted, orchestrator.observe(orchestrator.read_events(tmp_path / "events.jsonl")[0], {t.run_id: t.focus for t in scripted}), tmp_path, 2)
    influencer_present = blackbox.FEATURES.index("influencer_present")
    assert [row[influencer_present] for row in staged["X"]] == [0.0, 1.0] + [0.0] * 6


def test_both_models_get_the_same_rows_labels_and_folds(tmp_path):
    seen = {}

    def whitebox(plan, work):
        seen["plan"] = plan
        return {"accuracy": 0.5, "accuracy_std": 0.0, "auc": 0.5, "auc_std": 0.0, "shuffled_accuracy": 0.5}

    report, _ = run(tmp_path, FakeContainer(evaluate=whitebox), cv=3, seed=7)
    plan = seen["plan"]
    assert [r["run_id"] for r in plan["rows"]] == report["rows"]["run_ids"] and [r["label"] for r in plan["rows"]] == [i % 2 for i in range(8)]
    assert plan["folds"] == blackbox.stratified_folds([i % 2 for i in range(8)], 3, 7) and plan["seed"] == 7
    assert sorted(i for fold in plan["folds"] for i in fold) == list(range(8))
    assert report["config"]["folds"] == 3


def test_the_plan_reads_every_run_at_the_step_asked_for(tmp_path):
    seen = {}
    zeros = {"accuracy": 0, "accuracy_std": 0, "auc": 0, "auc_std": 0, "shuffled_accuracy": 0}
    run(tmp_path, FakeContainer(steps={"run0": 1, "run1": 5}, evaluate=lambda plan, work: seen.update(plan=plan) or zeros), step=3)
    steps = {r["run_id"]: r["step"] for r in seen["plan"]["rows"]}
    assert steps["run0"] == 1 and steps["run1"] == 3 and steps["run2"] == 3


def test_folds_are_capped_at_the_smaller_class(tmp_path):
    report, _ = run(tmp_path, cv=5, tasks=[Task(f"r{i}", "t", int(i < 3)) for i in range(9)])
    assert report["config"]["folds"] == 3


def test_runs_with_no_events_or_no_activations_are_left_out_and_named(tmp_path):
    container = FakeContainer(steps={"run0": 0}, failures={"run1": "OutOfMemoryError: boom"})
    container.no_activations = {"run1"}
    report, _ = run(tmp_path, container)
    rows = report["rows"]
    assert rows["n"] == 6 and rows["no_steps"] == ["run0"] and rows["no_activations"] == ["run1"]
    assert rows["container_failures"] == {"run1": "OutOfMemoryError: boom"}
    assert "run0" not in rows["run_ids"] and "run1" not in rows["run_ids"]


def test_runs_read_early_are_reported(tmp_path):
    report, _ = run(tmp_path, FakeContainer(steps={"run2": 1}), step=2)
    assert report["rows"]["short_runs"] == {"run2": 1}


def test_skip_run_reuses_what_is_in_the_folder(tmp_path):
    run(tmp_path)
    again, container = run(tmp_path, FakeContainer(), skip_run=True)
    assert len(container.commands) == 1 and container.commands[0][-5] == "evaluate" and again["rows"]["n"] == 8 and not container.sessions


def test_skip_run_with_nothing_there_says_so(tmp_path):
    with pytest.raises(ContainerError, match="event stream"):
        run(tmp_path, skip_run=True)


def test_an_agent_container_that_fails_stops_the_experiment(tmp_path):
    with pytest.raises(ContainerError, match="status 1"):
        run(tmp_path, FakeContainer(returncode=1))


def test_a_container_that_does_not_score_is_an_error(tmp_path):
    with pytest.raises(ContainerError, match="did not score"):
        run(tmp_path, FakeContainer(score=False))


def test_a_stale_whitebox_result_is_not_mistaken_for_a_new_one(tmp_path):
    (tmp_path / "whitebox_result.json").write_text("{}")
    with pytest.raises(ContainerError, match="did not score"):
        run(tmp_path, FakeContainer(score=False))


@pytest.mark.parametrize("bad", [dict(step=0), dict(tasks=[Task("a", "t", 1), Task("b", "t", 1), Task("c", "t", 0)])])
def test_a_setup_that_cannot_be_scored_is_refused_before_the_container_scores(tmp_path, bad):
    with pytest.raises(ValueError):
        run(tmp_path, **bad)


def test_nothing_to_score_is_refused(tmp_path):
    with pytest.raises(ValueError, match="no run has both"):
        run(tmp_path, FakeContainer(default_steps=0))


# --- the command line ----------------------------------------------------------------------------------


def test_the_command_line_runs_the_experiment_and_prints_both_columns(tmp_path, monkeypatch, capsys):
    fake = FakeContainer()
    monkeypatch.setattr(orchestrator, "run_docker", fake)
    monkeypatch.setattr(orchestrator, "DockerSession", fake.spawn)
    path = write_tasks(tmp_path, [{"run_id": f"r{i}", "text": "t", "label": i % 2, "influencer_messages": ["psst"]} for i in range(6)])
    assert orchestrator.main([str(path), "--work", str(tmp_path / "w"), "--step", "2", "--build", "--offline", "--no-gpu", "--cv", "2"]) == 0
    out = capsys.readouterr().out
    assert "observer" in out and "whitebox" in out and "6 runs (6 with an influencer)" in out and "shuffled_accuracy" in out
    build, agents, score = fake.commands
    assert "--gpus" not in agents and agents[agents.index("--network") + 1] == "none"
    assert fake.replies[0] == "psst"


def test_the_command_line_reports_a_problem_instead_of_a_traceback(tmp_path, capsys):
    path = write_tasks(tmp_path, [])
    assert orchestrator.main([str(path), "--work", str(tmp_path), "--step", "1"]) == 1
    assert "error:" in capsys.readouterr().err


def test_the_report_says_what_was_left_out(tmp_path):
    container = FakeContainer(steps={"run0": 0, "run2": 1})
    report, _ = run(tmp_path, container, step=2)
    text = orchestrator.format_report(report)
    assert "run0" in text and "left out" in text and "earlier step" in text and "base rate" in text
