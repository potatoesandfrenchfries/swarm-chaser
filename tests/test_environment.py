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


def test_a_reply_that_is_not_json_ends_that_agents_turns_and_is_recorded_as_text():
    model = Script({"alice": ["I would rather not say", act()], "bob": [act(), DONE]})
    captured, events, _ = play(model)
    assert types(events, "alice") == ["probe", "agent_text"] and len(captured) == 1
    assert [e["text"] for e in events if e["type"] == "agent_text"] == ["I would rather not say"]


def test_an_unknown_tool_or_a_tool_that_is_not_a_string_ends_the_agent():
    model = Script({"alice": [act("format_disk")], "bob": [json.dumps({"tool": ["x"], "args": {}})]})
    _, events, _ = play(model)
    assert types(events, "alice")[-1] == "finished" and types(events, "bob")[-1] == "finished"


def test_wrong_arguments_are_a_result_the_agent_sees_not_a_crash():
    model = Script({"alice": [act("read_file", {"wrong": 1}), DONE], "bob": [DONE]})
    _, events, _ = play(model)
    assert "tool_call" in types(events, "alice")
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
    assert environment.parse_action("no braces") is None and environment.parse_action("{not json}") is None
