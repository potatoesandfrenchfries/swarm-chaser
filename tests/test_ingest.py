from ingest.village import episode_rows, join_report


def msg(id, agent="a", ts="2025-05-01T00:00:00Z", episode="e1", text="hello"):
    return {"id": id, "episode_id": episode, "agent": agent, "model": "", "ts": ts, "source": "chat", "text": text}


def mem(id, agent="a", ts="2025-05-01T00:00:30Z", episode="e1", text="memory"):
    return {"id": id, "episode_id": episode, "agent": agent, "model": "", "ts": ts, "source": "memory", "text": text}


def test_join_report_passes_when_memories_land_within_tolerance():
    messages = [msg("m1", ts="2025-05-01T00:00:00Z")]
    memories = [mem("mem1", ts="2025-05-01T00:00:30Z")]  # 30s after, within default 60s tolerance
    report = join_report(messages, memories)
    assert report["n_unmatched"] == 0
    assert report["pass"] is True


def test_join_report_flags_memories_with_no_nearby_message():
    messages = [msg("m1", ts="2025-05-01T00:00:00Z")]
    memories = [mem("mem1", ts="2025-05-01T05:00:00Z")]  # 5 hours later, outside tolerance
    report = join_report(messages, memories)
    assert report["n_unmatched"] == 1
    assert "mem1" in report["unmatched_ids"]


def test_join_report_only_matches_same_agent():
    messages = [msg("m1", agent="a", ts="2025-05-01T00:00:00Z")]
    memories = [mem("mem1", agent="b", ts="2025-05-01T00:00:10Z")]
    report = join_report(messages, memories)
    assert report["n_unmatched"] == 1


def test_episode_rows_mixes_sources_sorted_by_time():
    messages = [msg("m2", ts="2025-05-01T00:02:00Z"), msg("m1", ts="2025-05-01T00:00:00Z")]
    memories = [mem("mem1", ts="2025-05-01T00:01:00Z")]
    rows = episode_rows(messages, memories, "e1")
    assert [r["id"] for r in rows] == ["m1", "mem1", "m2"]


def test_episode_rows_excludes_other_episodes():
    messages = [msg("m1", episode="e1"), msg("m2", episode="e2")]
    rows = episode_rows(messages, [], "e1")
    assert [r["id"] for r in rows] == ["m1"]


# --- against the real export, when a local copy exists -------------------------------------------------
# The synthetic fixtures use the real column names, but only a real file shows whether the schema has
# drifted (SCHEMA.md changes between exports). Skipped on CI and for anyone without the gated download
# in local/hf/ (see MVP.md M1; `hf download aidigestorg/ai-village` then the files named below).

import pytest  # noqa: E402

from conftest import REPO_ROOT  # noqa: E402
from ingest.village import iter_jsonl, load_lookup, load_messages  # noqa: E402

REAL = REPO_ROOT / "local" / "hf"
needs_export = pytest.mark.skipif(not all((REAL / f).exists() for f in ("agents.jsonl.gz", "village_goals.jsonl.gz", "chat_messages.jsonl.gz")), reason="no local copy of the village export")


@needs_export
def test_the_real_small_tables_load_and_every_goal_period_has_a_start():
    lookup = load_lookup(REAL / "agents.jsonl.gz", REAL / "village_goals.jsonl.gz")
    assert len(lookup.agents) > 1 and len(lookup.episodes) > 1
    assert [e[1] for e in lookup.episodes] == sorted(e[1] for e in lookup.episodes)
    assert lookup.episodes[-1][2] is None  # the current goal is ongoing


@needs_export
def test_the_first_real_chat_rows_normalise_with_a_known_agent_and_episode(tmp_path):
    lookup = load_lookup(REAL / "agents.jsonl.gz", REAL / "village_goals.jsonl.gz")
    sample = tmp_path / "chat_sample.jsonl"
    sample.write_text("".join(__import__("json").dumps(r) + "\n" for _, r in zip(range(500), iter_jsonl(REAL / "chat_messages.jsonl.gz"))))
    stats = {}
    rows = load_messages(sample, lookup, stats=stats)
    assert rows and len(rows) + sum(stats.values()) == 500
    assert all(r["ts"].endswith("Z") and r["agent"] and r["model"] and r["episode_id"] for r in rows)
