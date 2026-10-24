import gzip
import json

import pytest

from conftest import AGENTS, GOALS, MEMORIES, MESSAGES, REPO_ROOT
from ingest.store import COLUMNS, build_slice, connect, read_rows, write_rows
from ingest.village import episode_rows, load_memories, load_messages


def export_dir(tmp_path, with_memories=True):
    """The four files `build_slice` reads, gzipped the way the export ships them."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    for name, records in (("agents", AGENTS), ("village_goals", GOALS), ("chat_messages", MESSAGES), ("agent_memories", MEMORIES if with_memories else None)):
        if records is not None:
            with gzip.open(tmp_path / f"{name}.jsonl.gz", "wt", encoding="utf-8") as f:
                f.writelines(json.dumps(r) + "\n" for r in records)
    return tmp_path


def test_rows_round_trip_through_sqlite_in_time_order(village, lookup):
    messages, memories = village
    rows = load_messages(messages, lookup) + load_memories(memories, lookup)
    db = connect(":memory:")
    assert write_rows(db, list(reversed(rows))) == len(rows)
    back = read_rows(db)
    assert back == sorted(rows, key=lambda r: (r["ts"], r["id"])) and set(back[0]) == set(COLUMNS)


def test_read_rows_matches_what_extract_expects_from_episode_rows(village, lookup):
    messages, memories = village
    m, k = load_messages(messages, lookup), load_memories(memories, lookup)
    db = connect(":memory:")
    write_rows(db, m + k)
    assert read_rows(db, "e1") == episode_rows(m, k, "e1")


def test_filtering_by_agent_and_episode(village, lookup):
    messages, _ = village
    db = connect(":memory:")
    write_rows(db, load_messages(messages, lookup))
    assert [r["id"] for r in read_rows(db, agent="alice")] == ["m1", "m2", "m6"]
    assert [r["id"] for r in read_rows(db, "e1", "alice")] == ["m1", "m2"]


def test_writing_the_same_rows_twice_does_not_duplicate_them(village, lookup):
    messages, _ = village
    rows = load_messages(messages, lookup)
    db = connect(":memory:")
    write_rows(db, rows)
    write_rows(db, rows)
    assert len(read_rows(db)) == len(rows)


def test_a_row_with_a_source_other_than_chat_or_memory_is_refused(lookup):
    db = connect(":memory:")
    bad = {"id": "x", "episode_id": "e1", "agent": "a", "model": "m", "ts": "t", "source": "email", "text": "t", "room": ""}
    with pytest.raises(Exception, match="CHECK"):
        write_rows(db, [bad])


def test_build_slice_keeps_only_the_named_episode_and_reports_what_it_skipped(tmp_path):
    db_path = tmp_path / "out" / "slice.sqlite"
    report = build_slice(export_dir(tmp_path / "export"), db_path, episodes=["e1"])
    assert report["chat"]["rows"] == 5 and report["memory"]["rows"] == 2
    assert report["chat"]["outside_slice"] == 1  # the e2 message
    db = connect(db_path)
    assert {r["episode_id"] for r in read_rows(db)} == {"e1"}


def test_build_slice_without_the_memories_file_says_so_instead_of_failing(tmp_path):
    report = build_slice(export_dir(tmp_path / "export", with_memories=False), ":memory:", episodes=["e1"])
    assert report["chat"]["rows"] == 5 and report["memory"]["rows"] is None


def test_building_twice_gives_identical_databases(tmp_path):
    src = export_dir(tmp_path / "export")
    dumps = []
    for name in ("a.sqlite", "b.sqlite"):
        build_slice(src, tmp_path / name, episodes=["e1", "e2"])
        dumps.append(read_rows(connect(tmp_path / name)))
    assert dumps[0] == dumps[1] and len(dumps[0]) == 8


def test_an_episode_id_that_is_not_in_the_export_stops_the_build(tmp_path):
    with pytest.raises(KeyError, match="nope"):
        build_slice(export_dir(tmp_path / "export"), ":memory:", episodes=["nope"])


def test_the_committed_slice_is_used_when_no_episodes_are_given(tmp_path):
    """The default must be slice.toml; the synthetic export has none of its episodes, so the build refuses."""
    with pytest.raises(KeyError):
        build_slice(export_dir(tmp_path / "export"), ":memory:")


REAL = REPO_ROOT / "local" / "hf"


@pytest.mark.skipif(not (REAL / "chat_messages.jsonl.gz").exists(), reason="no local copy of the village export")
def test_the_real_slice_builds_and_every_row_has_an_agent_model_and_utc_time(tmp_path):
    report = build_slice(REAL, tmp_path / "slice.sqlite")
    rows = read_rows(connect(tmp_path / "slice.sqlite"))
    assert report["chat"]["rows"] > 1000 and len(rows) >= report["chat"]["rows"]
    assert all(r["agent"] and r["model"] and r["ts"].endswith("Z") and r["episode_id"] for r in rows)
