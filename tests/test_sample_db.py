"""Person 2's stages read the sample database that Person 1 hands over (`ingest.handoff`, #65).

`run_stages` reads the database the way the real run will and feeds every M6 and M7 stage that needs no
model call. It runs on a synthetic database built by the same code, and on the real `local/sample.sqlite`
when that file is present. The real file holds village text, so it is git-ignored and CI skips that test.
"""
import sqlite3
from datetime import datetime, timezone

import pytest

from check.checker import Verdict
from conftest import REPO_ROOT
from eval.validation import agreement_report, locate_findings, perturbation_test
from ingest.handoff import (
    SAMPLE_DB,
    build_sample,
    read_claim_rooms,
    read_claims,
    read_edges,
    read_record,
    read_room_members,
    read_room_timelines,
    read_verdicts,
)
from ingest.store import build_slice, read_rows
from spread.linker import baseline_link, visible_rows
from test_handoff import claim, write_export

REAL_SAMPLE = REPO_ROOT / SAMPLE_DB
LINKED_CLAIMS = 20  # the linkers compare a claim with every later row, so the real file is sampled, not run whole


def run_stages(db: sqlite3.Connection) -> dict:
    claims, verdicts, rows = read_claims(db), read_verdicts(db), read_rows(db)
    rooms, timelines = read_claim_rooms(db), read_room_timelines(db)
    assert claims, "the sample database holds no claims"
    assert set(rooms) == {c.claim_id for c in claims}

    # M7.5 quotes a claim from its record, and build_page refuses a quote that is not word for word in it.
    for c in claims:
        record = read_record(db, c)
        assert record is None or c.quote in record, c.claim_id

    # M6.2 pairs the two vendors' verdicts by claim id; every verdict must be on a stored claim.
    assert {v.claim_id for v in verdicts} <= {c.claim_id for c in claims}
    judges = sorted({v.judge for v in verdicts})
    agreement = None
    if len(judges) == 2:
        a, b = ([v for v in verdicts if v.judge == j] for j in judges)
        agreement = agreement_report(a, b)
        assert agreement["n_paired"] + agreement["n_only_a"] == len({v.claim_id for v in a})

    # M6.1 runs on the claims as stored; a checker that flags everything catches every change.
    perturbation = perturbation_test(claims, lambda c: "contradicted")
    assert perturbation["n_caught"] == perturbation["n_perturbable"]

    # M6.3 matches findings to contradicted claims by agent and UTC day.
    contradicted = {v.claim_id for v in verdicts if v.verdict == "contradicted"}
    found = [c for c in claims if c.claim_id in contradicted]
    if found:
        day = datetime.fromisoformat(found[0].ts.replace("Z", "+00:00")).astimezone(timezone.utc).date().isoformat()
        finding = {"id": "F1", "agents": [found[0].agent], "behavior_dates": day}
        assert locate_findings([finding], found) == {"F1"}

    # M7 links each claim only to later rows its readers could have seen.
    n_edges = 0
    for c in claims[:LINKED_CLAIMS]:
        later = visible_rows(c, [r for r in rows if r["ts"] > c.ts], rooms[c.claim_id] or None, timelines)
        edges = baseline_link(c, later)
        assert {e.later_message_id for e in edges} <= {r["id"] for r in later}
        n_edges += len(edges)
    return {"claims": len(claims), "judges": judges, "agreement": agreement, "perturbable": perturbation["n_perturbable"], "edges": n_edges}


def test_person_2_stages_run_on_a_synthetic_sample_database(tmp_path):
    export = write_export(tmp_path / "hf")
    build_slice(export, tmp_path / "slice.sqlite", episodes=["e1", "e2"])
    claims = [claim("e1#0-e1-0", "m2", quote="The nightly build passed with 12 tests green"), claim("e1#1-e1-0", "m10", agent="bob", quote="The main room is busy")]
    verdicts = [
        Verdict("e1#0-e1-0", "contradicted", ["3 of 12 tests failed"], "a", 0.9),
        Verdict("e1#0-e1-0", "supported", [], "b", 0.5),
        Verdict("e1#1-e1-0", "supported", [], "a", 0.8),
    ]
    build_sample(tmp_path / "slice.sqlite", tmp_path / "sample.sqlite", claims, verdicts, export)

    out = run_stages(sqlite3.connect(tmp_path / "sample.sqlite"))
    assert out["judges"] == ["a", "b"]
    assert out["edges"] == 1  # bob's m3 repeats alice's claim word for word
    assert (out["agreement"]["n_paired"], out["agreement"]["n_only_a"]) == (1, 1)


@pytest.mark.skipif(not REAL_SAMPLE.exists(), reason=f"real sample database not at {REAL_SAMPLE} (git-ignored, dataset terms)")
def test_person_2_stages_run_on_the_real_sample_database():
    out = run_stages(sqlite3.connect(REAL_SAMPLE))
    assert out["claims"] > 0


@pytest.fixture(scope="module")
def real_db():
    if not REAL_SAMPLE.exists():
        pytest.skip(f"real sample database not at {REAL_SAMPLE} (git-ignored, dataset terms)")
    con = sqlite3.connect(f"file:{REAL_SAMPLE}?mode=ro", uri=True)
    yield con
    con.close()


def test_every_stored_baseline_edge_is_a_later_visible_chat_repeat_in_the_claims_episode(real_db):
    claims = {c.claim_id: c for c in read_claims(real_db)}
    rows = {r[0]: r for r in real_db.execute("SELECT id, episode_id, agent, ts, source FROM rows")}
    timelines, rooms = read_room_timelines(real_db), read_claim_rooms(real_db)
    edges = read_edges(real_db, "baseline")
    assert edges
    for e in edges:
        claim_, (_, episode, agent, ts, source) = claims[e.claim_id], rows[e.later_message_id]
        assert claim_.source == "chat" and source == "chat" and episode == claim_.episode
        assert agent == e.agent != claim_.agent and ts == e.ts and ts > claim_.ts  # timestamps are fixed-width UTC, so string order is time order
        row = {"id": e.later_message_id, "agent": agent, "ts": ts}
        assert visible_rows(claim_, [row], rooms[e.claim_id] or None, timelines) == [row]


def test_every_agent_who_wrote_a_row_has_a_room_timeline_and_a_place_on_a_member_list(real_db):
    agents = {a for (a,) in real_db.execute("SELECT DISTINCT agent FROM rows")}
    assert agents <= set(read_room_timelines(real_db))
    assert agents <= set().union(*read_room_members(real_db).values())
