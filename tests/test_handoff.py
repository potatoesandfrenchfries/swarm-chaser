"""The sample database handed to Person 2 (M4.5, #65), built from the synthetic village. No real data, no network."""

import gzip
import json
import sqlite3

import pytest

from check.checker import Verdict
from conftest import AGENTS, GOALS, MEMORIES, MESSAGES, chat
from extract.claims import Claim
from ingest.handoff import (
    ROOMS_BEGAN,
    build_sample,
    connect_sample,
    read_claim_rooms,
    read_claims,
    read_record,
    read_room_members,
    read_room_timelines,
    read_verdicts,
    write_claims,
    write_verdicts,
)
from ingest.store import build_slice, read_rows
from spread.linker import visible_rows

# Two rooms: "room1" is the only one until "room2" is made (2026-03-05), and "room2" is for alice alone.
# In 2026 alice moves to room2 and back; bob stays in room1; "room3" excludes carol.
ROOMS = [
    {"id": "room1", "name": "general", "created_at": "2025-04-01 00:00:00", "deleted_at": None, "whitelisted_agent_names": None, "blacklisted_agent_names": None},
    {"id": "room2", "name": "side", "created_at": "2026-03-05 00:00:00", "deleted_at": "2026-03-09 00:00:00", "whitelisted_agent_names": ["alice"], "blacklisted_agent_names": None},
    {"id": "room3", "name": "rest", "created_at": "2026-03-06 00:00:00", "deleted_at": None, "whitelisted_agent_names": None, "blacklisted_agent_names": ["carol"]},
]
LATER = [
    chat("m7", "alice", "2026-04-01 09:00:00.000000", "Working from the side room.", room="room2"),
    chat("m8", "alice", "2026-04-01 09:05:00.000000", "Still in the side room.", room="room2"),
    chat("m9", "alice", "2026-04-02 09:00:00.000000", "Back in the main room.", room="room1"),
    chat("m10", "bob", "2026-04-02 10:00:00.000000", "The main room is busy.", room="room1"),
]


def write_export(root, messages=None):
    root.mkdir(parents=True, exist_ok=True)
    for name, records in (("agents", AGENTS), ("village_goals", GOALS), ("chat_messages", messages or MESSAGES + LATER), ("agent_memories", MEMORIES), ("chat_rooms", ROOMS)):
        with gzip.open(root / f"{name}.jsonl.gz", "wt", encoding="utf-8") as f:
            f.writelines(json.dumps(r) + "\n" for r in records)
    return root


def claim(claim_id, row_id, episode="e1", **kw):
    fields = dict(claim_id=claim_id, episode=episode, agent="alice", model="model-x", ts="2025-05-01T10:00:00.000000Z", source="chat",
                  quote="The nightly build passed", claim_type="self-report", checkable=True, extractor="e1", row_id=row_id)
    return Claim(**{**fields, **kw})


@pytest.fixture
def sample(tmp_path):
    export = write_export(tmp_path / "hf")
    slice_db = tmp_path / "slice.sqlite"
    build_slice(export, slice_db, episodes=["e1", "e2"])
    claims = [claim("e1#0-e1-0", "m2"), claim("e1#1-e1-0", "m10", episode="e1", agent="bob", quote="The main room is busy")]  # m10 is an e2 row
    verdicts = [Verdict("e1#0-e1-0", "contradicted", ["3 of 12 tests failed"], "a", 0.9), Verdict("e1#0-e1-0", "supported", [], "b", 0.5)]
    out = tmp_path / "sample.sqlite"
    report = build_sample(slice_db, out, claims, verdicts, export)
    return sqlite3.connect(out), report


def test_the_sample_holds_the_rows_claims_and_verdicts_it_was_given(sample):
    db, report = sample
    assert report["rows"] == len(read_rows(db)) == 12 and report["claims"] == 2 and report["verdicts"] == 2
    assert [v.judge for v in read_verdicts(db)] == ["a", "b"]  # two vendors on one claim, told apart by judge
    assert read_verdicts(db)[0] == Verdict("e1#0-e1-0", "contradicted", ["3 of 12 tests failed"], "a", 0.9)


def test_a_claim_takes_its_episode_and_room_from_its_own_row(sample):
    db, report = sample
    by_id = {c.claim_id: c for c in read_claims(db)}
    assert by_id["e1#1-e1-0"].episode == "e2" and report["episode_repaired"] == 1  # the claim said e1, the row is in e2
    assert read_claim_rooms(db) == {"e1#0-e1-0": "room1", "e1#1-e1-0": "room1"}


def test_a_memory_claim_has_no_room_and_a_claim_with_no_row_is_counted(tmp_path):
    db = connect_sample(":memory:")
    db.execute("INSERT INTO rows VALUES ('k1', 'e1', 'alice', 'm', '2025-05-01T10:00:30.000000Z', 'memory', 'Build log', '')")
    report = write_claims(db, [claim("c1", "k1", source="memory"), claim("c2", "")])
    assert read_claim_rooms(db) == {"c1": "", "c2": ""} and report["row_missing"] == 1


def test_the_record_a_quote_is_checked_against_is_its_row_as_the_extractor_saw_it(sample):
    db, _ = sample
    c = read_claims(db)[0]
    record = read_record(db, c)
    assert c.quote in record and record.startswith("[2025-05-01T10:00:00.000000Z] alice (chat):")
    assert read_record(db, claim("x", "")) is None and read_record(db, claim("x", "no-such-row")) is None


def test_room_members_are_the_whitelist_or_everyone_but_the_blacklist(sample):
    db, _ = sample
    members = read_room_members(db)
    assert members["room1"] == {"alice", "bob", "carol", "dave"}
    assert members["room2"] == {"alice"}
    assert members["room3"] == {"alice", "bob", "dave"}


def test_each_agent_starts_in_the_only_room_then_follows_where_they_spoke(sample):
    db, report = sample
    timelines = read_room_timelines(db)
    assert timelines["alice"] == [(ROOMS_BEGAN, "room1"), ("2026-04-01T09:00:00.000000Z", "room2"), ("2026-04-02T09:00:00.000000Z", "room1")]  # m8 repeats room2: one entry
    assert timelines["bob"] == [(ROOMS_BEGAN, "room1")]  # bob spoke in room1 again at m10, which is no move
    assert db.execute("SELECT source FROM room_timeline WHERE agent = 'alice' ORDER BY ts").fetchall() == [("start",), ("chat",), ("chat",)]
    assert report["rooms"]["chat_before_second_room_outside_first_room"] == 0


def test_chat_before_the_second_room_in_another_room_is_reported(tmp_path):
    odd = MESSAGES + [chat("m11", "dave", "2025-05-02 09:00:00.000000", "Odd.", room="room2")]
    export = write_export(tmp_path / "hf", odd)
    build_slice(export, tmp_path / "s.sqlite", episodes=["e1", "e2"])
    report = build_sample(tmp_path / "s.sqlite", tmp_path / "out.sqlite", [], [], export)
    assert report["rooms"]["chat_before_second_room_outside_first_room"] == 1


def test_the_timelines_and_members_drive_visible_rows(sample):
    db, _ = sample
    timelines, members = read_room_timelines(db), read_room_members(db)
    later = [r for r in read_rows(db) if r["ts"] > "2026-04-01T09:00:00.000000Z" and r["source"] == "chat"]  # m8, m9, m10
    said = Claim("c", "e2", "bob", "model-y", "2026-04-01T09:00:00.000000Z", "chat", "q", "self-report", True, "e1", "m7")
    assert [r["id"] for r in visible_rows(said, later, "room2", timelines)] == ["m8", "m9"]  # alice was in room2 when it was said and until m9's day
    assert [r["id"] for r in visible_rows(said, later, "room1", timelines)] == ["m9"]  # in room1 only from m9
    assert members["room2"] == {"alice"}  # `could_have_seen(..., channel_members=members["room2"])` takes this set as it is


def test_an_unknown_verdict_word_is_refused(sample):
    db, _ = sample
    with pytest.raises(sqlite3.IntegrityError):
        write_verdicts(db, [Verdict("e1#0-e1-0", "maybe", [], "a", 0.5)])


def test_rebuilding_gives_the_same_contents(tmp_path):
    export = write_export(tmp_path / "hf")
    build_slice(export, tmp_path / "s.sqlite", episodes=["e1", "e2"])
    dumps = []
    for name in ("one", "two"):
        build_sample(tmp_path / "s.sqlite", tmp_path / f"{name}.sqlite", [claim("c", "m2")], [], export)
        dumps.append("\n".join(sqlite3.connect(tmp_path / f"{name}.sqlite").iterdump()))
    assert dumps[0] == dumps[1]
