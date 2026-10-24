"""The M6 and M7 code run on the real sample database (#65, #73). Skipped when the file is absent.

`local/sample.sqlite` holds village text (research use only), so it is git-ignored and absent from a fresh
clone and from CI: build it with `python -m adapters.sample_run publish`, or point SAMPLE_DB at a copy.
What is checked is shape and agreement between tables, not the checker's opinions, which change per run.
"""

import os
import sqlite3
from datetime import datetime, timezone

import pytest

from conftest import REPO_ROOT
from eval.validation import agreement_report, locate_findings, perturbation_test
from ingest.handoff import (
    SAMPLE_DB,
    read_claim_rooms,
    read_claims,
    read_edges,
    read_record,
    read_room_members,
    read_room_timelines,
    read_verdicts,
)
from ingest.village import _parse_ts
from spread.linker import visible_rows

PATH = os.environ.get("SAMPLE_DB") or REPO_ROOT / SAMPLE_DB
pytestmark = pytest.mark.skipif(not os.path.exists(PATH), reason=f"no sample database at {SAMPLE_DB} (gitignored, dataset terms): python -m adapters.sample_run publish")


@pytest.fixture(scope="module")
def db():
    con = sqlite3.connect(f"file:{PATH}?mode=ro", uri=True)
    yield con
    con.close()


def test_every_claim_sits_in_its_rows_episode_and_its_quote_is_in_its_record(db):
    claims = read_claims(db)
    assert claims
    episodes = dict(db.execute("SELECT id, episode_id FROM rows"))
    assert [c.claim_id for c in claims if episodes.get(c.row_id) != c.episode] == []
    assert [c.claim_id for c in claims if c.quote not in (read_record(db, c) or "")] == []


def test_every_verdict_is_for_a_known_claim_and_each_vendor_judges_a_claim_once(db):
    ids = {c.claim_id for c in read_claims(db)}
    verdicts = read_verdicts(db)
    assert {v.claim_id for v in verdicts} <= ids
    assert len({(v.claim_id, v.judge) for v in verdicts}) == len(verdicts)
    assert all(0 <= v.confidence <= 1 for v in verdicts)


def _by_judge(db):
    out: dict = {}
    for v in read_verdicts(db):
        out.setdefault(v.judge, []).append(v)
    return out


def test_agreement_report_runs_on_the_two_vendors(db):
    judged = _by_judge(db)
    if len(judged) < 2:
        pytest.skip(f"verdicts from {len(judged)} vendor so far; agreement needs two")
    (_, a), (_, b) = sorted(judged.items())[:2]
    report = agreement_report(a, b)
    assert report["judges"][0] != report["judges"][1]
    assert report["n_paired"] == len({v.claim_id for v in a} & {v.claim_id for v in b})
    assert 0 <= report["agreement"] <= 1


def test_perturbation_test_runs_on_the_supported_claims(db):
    claims = {c.claim_id: c for c in read_claims(db)}
    supported = [claims[v.claim_id] for v in read_verdicts(db) if v.verdict == "supported"]
    if not supported:
        pytest.skip("no claim has been judged supported yet")
    seen = []
    result = perturbation_test(supported, lambda c: seen.append(c) or "supported")  # a checker that catches nothing
    assert result["n_perturbable"] == len(seen) <= len(supported)
    assert all(p.quote != claims[p.claim_id].quote for p in seen)  # the real quote is left alone
    assert result["n_caught"] == 0


def test_a_finding_naming_a_contradicted_claims_agent_on_its_day_is_located(db):
    claims = {c.claim_id: c for c in read_claims(db)}
    contradicted = [claims[v.claim_id] for v in read_verdicts(db) if v.verdict == "contradicted"]
    if not contradicted:
        pytest.skip("no claim has been judged contradicted yet")
    c = contradicted[0]
    day = datetime.fromtimestamp(_parse_ts(c.ts), timezone.utc).date().isoformat()
    finding = {"id": "F1", "behavior_dates": day, "agents": [c.agent]}
    assert locate_findings([finding], contradicted) == {"F1"}
    assert locate_findings([{**finding, "behavior_dates": "1999-01-01"}], contradicted) == set()


def test_every_agent_who_wrote_a_row_has_a_room_timeline_and_a_place_on_a_member_list(db):
    agents = {a for (a,) in db.execute("SELECT DISTINCT agent FROM rows")}
    assert agents <= set(read_room_timelines(db))
    assert agents <= set().union(*read_room_members(db).values())


def test_every_baseline_edge_is_a_later_visible_chat_repeat_in_the_claims_episode(db):
    claims = {c.claim_id: c for c in read_claims(db)}
    rows = {r[0]: r for r in db.execute("SELECT id, episode_id, agent, ts, source FROM rows")}
    timelines, rooms = read_room_timelines(db), read_claim_rooms(db)
    edges = read_edges(db, "baseline")
    assert edges
    for e in edges:
        claim, (_, episode, agent, ts, source) = claims[e.claim_id], rows[e.later_message_id]
        assert claim.source == "chat" and source == "chat" and episode == claim.episode
        assert agent == e.agent != claim.agent and ts == e.ts and _parse_ts(ts) > _parse_ts(claim.ts)
        row = {"id": e.later_message_id, "agent": agent, "ts": ts}
        assert visible_rows(claim, [row], rooms[e.claim_id] or None, timelines) == [row]
