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
