"""The container's agent environment (`whitebox/environment.py`): agents on one board, an outside influencer, a probe on one agent.

Stdlib only, and the model is a script: no GPU, no download, so this runs in the fast CI job too.
"""

import json
import re
import sys

from conftest import REPO_ROOT

sys.path.insert(0, str(REPO_ROOT / "whitebox"))  # its modules import each other flat, as they do in the image

import environment  # noqa: E402


def act(tool="list_files", args=None, reasoning="why"):
    return json.dumps({"reasoning": reasoning, "tool": tool, "args": {"directory": "/p"} if args is None and tool == "list_files" else (args or {})})


DONE = json.dumps({"reasoning": "finished", "tool": "done", "args": {}})


class Script:
    """A model that replies from a list per agent and records what each agent was shown."""

    def __init__(self, replies):
        self.replies = {name: list(items) for name, items in replies.items()}
        self.prompts = []  # (agent, the conversation it was shown)

    def __call__(self, messages):
        name = re.search(r"You are (\w+)\.", messages[0]["content"]).group(1)
        self.prompts.append((name, [dict(m) for m in messages]))
        queue = self.replies[name]
        return (queue.pop(0) if queue else DONE), [float(len(self.prompts))]

    def shown(self, name, n=-1):
        return [p for who, p in self.prompts if who == name][n]


def episode(**extra):
    return {"run_id": "r", "text": "Tidy the project.", "agents": [{"name": "alice", "private": "Only alice knows X."}, {"name": "bob", "private": ""}], "focus": "alice", "rounds": 3, **extra}


def play(model, ep=None, influencer=None):
    events, requests = [], []

    def ask(request):
        requests.append(request)
        return influencer(request) if influencer else None

    captured = environment.run_episode(ep or episode(), model, ask, events.append)
    return captured, events, requests


def types(events, agent=None):
    return [e["type"] for e in events if agent is None or e.get("agent") == agent]


def test_one_agent_thinks_acts_and_finishes_and_the_probe_marks_each_step():
    model = Script({"agent": [act(), act("read_file", {"path": "/p/a"}), DONE]})
    captured, events, _ = play(model, {"run_id": "r", "text": "t"})
    assert types(events) == ["task", "probe", "reasoning", "tool_call", "probe", "reasoning", "tool_call", "probe", "reasoning", "finished"]
    assert [e["step"] for e in events if e["type"] == "probe"] == [1, 2, 3] and len(captured) == 3


def test_the_probe_is_marked_before_the_step_it_reads_and_only_for_the_focus_agent():
    model = Script({"alice": [act(), DONE], "bob": [act(), act(), DONE]})
    captured, events, _ = play(model)
    probes = [e for e in events if e["type"] == "probe"]
    assert {p["agent"] for p in probes} == {"alice"} and len(captured) == len(probes) == 2
    for i, e in enumerate(events):
        if e["type"] == "probe":
            assert events[i + 1]["type"] in ("reasoning", "agent_text") and events[i + 1]["agent"] == "alice"


def test_the_captured_vectors_are_the_focus_agents_own_in_order():
    model = Script({"alice": [act(), DONE], "bob": [act(), act(), DONE]})
    captured, _, _ = play(model)
    seen = [who for who, _ in model.prompts]
    assert captured == [[float(seen.index("alice") + 1)], [float([i for i, w in enumerate(seen) if w == "alice"][1] + 1)]]


def test_each_agent_is_told_the_task_and_only_its_own_private_brief():
    model = Script({"alice": [DONE], "bob": [DONE]})
    play(model)
    alice, bob = model.shown("alice"), model.shown("bob")
    assert "Tidy the project.\n\nOnly alice knows X." == alice[1]["content"] and bob[1]["content"] == "Tidy the project."
    assert "You are alice. You share a board with bob." in alice[0]["content"] and "say(text)" in alice[0]["content"]


def test_a_post_reaches_the_other_agents_next_turn_and_never_the_poster():
    model = Script({"alice": [act("say", {"text": "found the config"}), DONE], "bob": [act(), DONE]})
    _, events, _ = play(model)
    assert {"type": "board", "agent": "alice", "text": "found the config"} == {k: events[[e["type"] for e in events].index("board")][k] for k in ("type", "agent", "text")}
    assert model.shown("bob", 0)[-1]["content"] == "Board:\n[alice] found the config"  # alice goes first, so bob sees it on his first turn
    assert not [m for m in model.shown("alice") if m["content"].startswith("Board:")]  # her own post is not shown back to her


def test_the_influencer_is_asked_at_the_start_of_every_round_and_speaks_to_everyone():
    model = Script({"alice": [act(), act(), DONE], "bob": [act(), act(), DONE]})
    _, events, requests = play(model, influencer=lambda request: "The build failed." if request["round"] == 2 else None)
    assert [r["round"] for r in requests] == [1, 2, 3] and {r["run_id"] for r in requests} == {"r"} and {r["type"] for r in requests} == {"influencer_request"}
    assert requests[1]["board"] == [] and requests[2]["board"] == [{"from": "influencer", "text": "The build failed."}]
    spoke = [e for e in events if e["type"] == "influencer"]
    assert [(e["round"], e["text"]) for e in spoke] == [(2, "The build failed.")]
    for name in ("alice", "bob"):
        assert model.shown(name, 1)[-1]["content"] == "Board:\n[influencer] The build failed."  # their turn in round 2


def test_the_influencer_speaks_before_the_probe_so_the_observer_can_see_it_at_that_step():
    model = Script({"alice": [act(), DONE], "bob": [DONE]})
    _, events, _ = play(model, influencer=lambda request: "Look again." if request["round"] == 2 else None)
    order = [e["type"] for e in events]
    assert order.index("influencer") < len(order) - 1 - order[::-1].index("probe")
    second_probe = [i for i, t in enumerate(order) if t == "probe"][1]
    assert order[second_probe - 1] == "influencer"


def test_the_influencer_is_not_asked_once_everyone_has_finished():
    model = Script({"alice": [DONE], "bob": [DONE]})
    _, _, requests = play(model)
    assert [r["round"] for r in requests] == [1]


def test_the_rounds_are_capped():
    model = Script({"alice": [act()] * 10, "bob": [act()] * 10})
    captured, _, requests = play(model, episode(rounds=2))
    assert len(requests) == 2 and len(captured) == 2


def test_a_reply_that_stays_not_json_after_the_retries_ends_that_agents_turns_and_is_recorded_as_text():
    model = Script({"alice": ["I would rather not say", "No.", "Still no.", act()], "bob": [act(), DONE]})
    captured, events, _ = play(model)
    assert types(events, "alice") == ["probe", "format_error", "format_error", "agent_text"] and len(captured) == 1
    assert [e["text"] for e in events if e["type"] == "agent_text"] == ["Still no."]
    assert model.replies["alice"] == [act()]  # the fourth reply was never asked for


def test_a_reply_that_is_not_json_is_sent_back_and_the_agent_carries_on_if_it_fixes_it():
    model = Script({"alice": ['```json\n{"tool": "run_command(run_command(', act(), DONE], "bob": [DONE]})
    captured, events, _ = play(model)
    assert types(events, "alice")[:5] == ["probe", "format_error", "reasoning", "tool_call", "probe"] and len(captured) == 2  # the retry is not a second decision point
    retry = model.shown("alice", 1)
    assert retry[-2]["role"] == "assistant" and retry[-1]["content"] == environment.FORMAT_NUDGE
    assert [e["text"] for e in events if e["type"] == "format_error"] == ['```json\n{"tool": "run_command(run_command(']


def test_a_tool_name_with_junk_after_it_is_read_as_its_first_word():
    assert environment.tool_name("run_command(run_command(send_email(") == "run_command"
    assert environment.tool_name("  list_files ") == "list_files" and environment.tool_name("") is None
    assert environment.tool_name(["x"]) is None and environment.tool_name("(nothing)") is None
    model = Script({"alice": [json.dumps({"tool": "list_files(/p)", "args": {"directory": "/p"}}), DONE], "bob": [DONE]})
    _, events, _ = play(model)
    assert [e["tool"] for e in events if e["type"] == "tool_call"] == ["list_files"]


def test_every_tool_result_ends_with_a_hint_to_finish():
    model = Script({"alice": [act(), DONE], "bob": [DONE]})
    play(model)
    result = model.shown("alice")[-1]["content"]
    assert result.startswith("Tool result: [fake]") and result.endswith(environment.FINISH_HINT)


def test_an_agent_that_makes_the_same_call_over_and_over_is_stopped():
    model = Script({"alice": [act()] * 6, "bob": [DONE]})
    captured, events, _ = play(model, episode(rounds=6))
    assert types(events, "alice").count("tool_call") == environment.MAX_REPEATS
    assert [e["tool"] for e in events if e["type"] == "finished" and e["agent"] == "alice"] == ["repeat"]
    assert len(captured) == environment.MAX_REPEATS


def test_a_different_call_in_between_restarts_the_count():
    other = act("read_file", {"path": "/p/a"})
    model = Script({"alice": [act(), act(), other, act(), act(), DONE], "bob": [DONE]})
    captured, events, _ = play(model, episode(rounds=6))
    assert "repeat" not in [e.get("tool") for e in events] and len(captured) == 6


def test_a_run_becomes_one_record_per_step_for_the_dataset():
    one_agent = {"run_id": "r", "text": "t", "rounds": 4}
    model = Script({"agent": [act(), act("say", {"text": "hello"}), act("format_disk"), DONE]})
    events = []
    vectors = environment.run_episode(one_agent, model, lambda request: None, events.append)
    records = environment.step_records(events, vectors, "r", 1)
    assert [r["tool"] for r in records] == ["list_files", "say", "format_disk"] and [r["step"] for r in records] == [0, 1, 2]
    assert all(r["label"] == 1 and r["run_id"] == "r" for r in records) and records[0]["reasoning"] == "why"
    assert [r["vec"] for r in records] == vectors


def test_a_step_with_no_usable_action_is_a_none_record():
    model = Script({"agent": ["blah", "blah", "blah"]})
    events = []
    vectors = environment.run_episode({"run_id": "r", "text": "t", "rounds": 2}, model, lambda request: None, events.append)
    assert [r["tool"] for r in environment.step_records(events, vectors, "r", 0)] == ["none"]


def test_only_the_focus_agents_steps_become_records():
    model = Script({"alice": [act(), DONE], "bob": [act("send_email", {"to": "x"}), DONE]})
    events = []
    vectors = environment.run_episode(episode(), model, lambda request: None, events.append)
    records = environment.step_records(events, vectors, "r", 0, focus="alice")
    assert [r["tool"] for r in records] == ["list_files", "done"]


def test_an_unknown_tool_or_a_tool_that_is_not_a_string_ends_the_agent():
    model = Script({"alice": [act("format_disk")], "bob": [json.dumps({"tool": ["x"], "args": {}})]})
    _, events, _ = play(model)
    assert types(events, "alice")[-1] == "finished" and types(events, "bob")[-1] == "finished"


def test_the_fake_tools_shrug_off_stray_arguments():
    model = Script({"alice": [act("read_file", {"wrong": 1}), DONE], "bob": [DONE]})
    _, events, _ = play(model)
    assert "tool_call" in types(events, "alice")
    assert model.shown("alice")[-1]["content"].startswith("Tool result: [fake] contents of <unspecified>")


def test_a_tool_that_rejects_its_arguments_is_a_result_the_agent_sees_not_a_crash(monkeypatch):
    def strict(path):
        return f"[fake] read {path}"

    monkeypatch.setitem(environment.TOOLS, "read_file", strict)
    model = Script({"alice": [act("read_file", {"wrong": 1}), DONE], "bob": [DONE]})
    play(model)
    assert model.shown("alice")[-1]["content"].startswith("Tool result: [error] bad arguments for read_file")


def test_arguments_that_are_not_an_object_are_treated_as_none():
    model = Script({"alice": [json.dumps({"tool": "list_files", "args": "/p"}), DONE], "bob": [DONE]})
    _, events, _ = play(model)
    assert [e["args"] for e in events if e["type"] == "tool_call"] == [{}]


def test_the_events_carry_no_label():
    model = Script({"alice": [act(), DONE], "bob": [DONE]})
    _, events, _ = play(model, influencer=lambda request: "hi")
    assert all("label" not in e for e in events)


def test_the_emitter_appends_json_lines_with_a_time(tmp_path):
    emit = environment.make_emitter(tmp_path / "events.jsonl")
    emit({"run_id": "r", "type": "task", "text": "one"})
    emit({"run_id": "r", "type": "tool_call", "tool": "list_files"})
    lines = [json.loads(line) for line in (tmp_path / "events.jsonl").read_text().splitlines()]
    assert [e["type"] for e in lines] == ["task", "tool_call"] and all("timestamp" in e for e in lines)


def test_an_action_is_found_inside_chatter_and_garbage_is_not_an_action():
    assert environment.parse_action('Sure! {"tool": "done", "args": {}} Hope that helps.') == {"tool": "done", "args": {}}
    assert environment.parse_action('{"tool": "done"} and then {"tool": "delete_file"}') == {"tool": "done"}  # the first object, not both
    assert environment.parse_action('{"reasoning": "a {nested} thing", "tool": "done"}')["tool"] == "done"
    assert environment.parse_action("no braces") is None and environment.parse_action("{not json}") is None


def test_the_step_that_hits_the_repeat_limit_keeps_the_tool_it_called():
    model = Script({"agent": [act()] * 5})
    events = []
    vectors = environment.run_episode({"run_id": "r", "text": "t", "rounds": 5}, model, lambda request: None, events.append)
    assert [r["tool"] for r in environment.step_records(events, vectors, "r", 0)] == ["list_files"] * environment.MAX_REPEATS
