import json

from check.checker import WINDOW_AFTER_SECONDS, WINDOW_BEFORE_SECONDS
from conftest import REPO_ROOT
from ingest.join import JOIN_WINDOW_SECONDS, MIN_COVERAGE, join_evidence
from ingest.slice import load_slice


def row(id, agent, ts, source, episode="e1"):
    return {"id": id, "episode_id": episode, "agent": agent, "model": "", "ts": ts, "source": source, "text": "t", "room": ""}


def chat(id, agent="a", ts="2025-05-01T00:00:00Z", episode="e1"):
    return row(id, agent, ts, "chat", episode)


def memory(id, agent="a", ts="2025-05-01T00:10:00Z", episode="e1"):
    return row(id, agent, ts, "memory", episode)


def test_the_window_is_the_one_the_checker_uses():
    assert JOIN_WINDOW_SECONDS == WINDOW_BEFORE_SECONDS == WINDOW_AFTER_SECONDS


def test_a_memory_ten_minutes_from_chat_joins_in_the_window_but_not_at_sixty_seconds():
    result = join_evidence([chat("c1"), memory("m1")])
    ep = result["episodes"]["e1"]
    assert result["pass"] is True
    assert ep["memories_with_chat_in_window"] == 1 and ep["chat_with_memory_in_window"] == 1
    assert ep["strict_60s"] == {"unmatched": 1, "unmatched_share": 1.0, "pass": False}
    assert ep["gap_to_nearest_chat_seconds"]["p50"] == 600


def test_memories_with_no_same_agent_chat_in_the_window_fail():
    rows = [chat("c1", "a"), memory("m1", "b", "2025-05-01T00:00:05Z")]
    result = join_evidence(rows)
    ep = result["episodes"]["e1"]
    assert result["pass"] is False
    assert ep["memories_with_chat_in_window"] == 0 and ep["memories_outside_window_sample"] == ["m1"]


def test_chat_with_no_memory_of_that_agent_in_the_window_fails():
    rows = [chat("c1", "a"), chat("c2", "b"), memory("m1", "a", "2025-05-01T00:00:05Z")]
    assert join_evidence(rows)["episodes"]["e1"]["chat_with_memory_in_window_share"] == 0.5
    assert join_evidence(rows)["pass"] is False


def test_a_fixed_offset_of_hours_between_the_clocks_fails_the_clock_check():
    rows = [chat(f"c{i}", ts=f"2025-05-01T{i:02d}:00:00Z") for i in range(10)]
    rows += [memory(f"m{i}", ts="2025-05-01T20:00:00Z") for i in range(10)]  # 11 h after the last chat: inside the window, not on its clock
    ep = join_evidence(rows)["episodes"]["e1"]
    assert ep["memories_with_chat_in_window_share"] == 1.0
    assert ep["pass"] is False


def test_the_window_is_inclusive_and_a_second_past_it_misses():
    on_edge = join_evidence([chat("c1"), memory("m1", ts="2025-05-02T00:00:00Z")])["episodes"]["e1"]
    past = join_evidence([chat("c1"), memory("m1", ts="2025-05-02T00:00:01Z")])["episodes"]["e1"]
    assert on_edge["memories_with_chat_in_window"] == 1 and past["memories_with_chat_in_window"] == 0


def test_episodes_are_judged_separately_and_the_run_fails_if_one_does():
    rows = [chat("c1"), memory("m1"), chat("c2", episode="e2"), memory("m2", agent="b", episode="e2")]
    result = join_evidence(rows)
    assert result["episodes"]["e1"]["pass"] is True and result["episodes"]["e2"]["pass"] is False
    assert result["pass"] is False


def test_an_empty_table_does_not_pass():
    assert join_evidence([])["pass"] is False


def test_coverage_bar_is_inclusive():
    rows = [chat("c1")] + [memory(f"m{i}") for i in range(9)] + [memory("far", ts="2025-06-01T00:00:00Z")]
    assert join_evidence(rows)["episodes"]["e1"]["memories_with_chat_in_window_share"] == MIN_COVERAGE


def test_the_recorded_result_covers_the_slice_episodes_and_agrees_with_itself():
    recorded = json.loads((REPO_ROOT / "join-test.json").read_text(encoding="utf-8"))
    assert recorded["window_seconds"] == JOIN_WINDOW_SECONDS
    assert set(recorded["episodes"]) == set(load_slice()["slice"]["episodes"])
    assert recorded["pass"] is all(e["pass"] for e in recorded["episodes"].values())
