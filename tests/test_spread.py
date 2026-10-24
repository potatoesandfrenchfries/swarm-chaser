from dataclasses import replace

import pytest

from check.checker import Verdict
from extract.claims import Claim
from llm.client import Completion, ModelClient, ModelSpec, ReplyNotJSON
from report.page import build_page, section_3_spread
from spread.linker import (
    SpreadEdge,
    baseline_link,
    case_candidates,
    compare_linkers,
    could_have_seen,
    documented_case,
    model_link,
    precision,
    relation_requests,
    room_at,
    sample_for_hand_check,
    spread_share,
    spread_share_intervals,
    spread_svg,
    visible_rows,
    was_in_room,
)


def claim(ts="2025-05-01T00:00:00Z", agent="a", quote="the quarterly report showed a sharp decline in revenue"):
    return Claim(claim_id="c1", episode="e1", agent=agent, model="", ts=ts, source="chat", quote=quote, claim_type="x", checkable=True)


def row(id, ts, agent="b", text=""):
    return {"id": id, "agent": agent, "ts": ts, "text": text}


def test_could_have_seen_requires_later_and_different_agent():
    c = claim(ts="2025-05-01T00:00:00Z", agent="a")
    assert could_have_seen("a", c.ts, row("r1", "2025-05-01T01:00:00Z", agent="b")) is True
    assert could_have_seen("a", c.ts, row("r1", "2025-04-30T00:00:00Z", agent="b")) is False  # earlier
    assert could_have_seen("a", c.ts, row("r1", "2025-05-01T01:00:00Z", agent="a")) is False  # same agent


def test_baseline_link_matches_on_shared_wording():
    c = claim()
    rows = [
        row("r1", "2025-05-01T01:00:00Z", text="I also saw the quarterly report showed a sharp decline in revenue"),
        row("r2", "2025-05-01T02:00:00Z", text="completely unrelated message about lunch"),
    ]
    edges = baseline_link(c, rows)
    assert [e.later_message_id for e in edges] == ["r1"]
    assert edges[0].relation == "repeats"


def test_baseline_link_ignores_rows_that_could_not_have_been_seen():
    c = claim(agent="a")
    rows = [row("r1", "2025-04-30T00:00:00Z", agent="b", text=c.quote)]  # before the claim
    assert baseline_link(c, rows) == []


def test_model_link_uses_supplied_classifier():
    c = claim()
    rows = [row("r1", "2025-05-01T01:00:00Z", agent="b", text="that's wrong, revenue actually grew")]

    def fake_classifier(prompt, content):
        return {"relation": "corrects"}

    edges = model_link(c, rows, fake_classifier)
    assert len(edges) == 1
    assert edges[0].relation == "corrects"


def test_spread_share_compares_false_against_supported():
    verdicts = [
        Verdict(claim_id="c1", verdict="contradicted", evidence=[], judge="j", confidence=0.9),
        Verdict(claim_id="c2", verdict="supported", evidence=[], judge="j", confidence=0.9),
    ]
    edges = [SpreadEdge(claim_id="c1", later_message_id="r1", relation="repeats", agent="b", ts="2025-05-01T01:00:00Z")]
    shares = spread_share(verdicts, edges, "repeats")
    assert shares["contradicted"] == 1.0
    assert shares["supported"] == 0.0


def test_relation_requests_lists_one_call_per_claim_and_eligible_row():
    rows = [row("r1", "2025-05-01T01:00:00Z"), row("r2", "2025-05-01T02:00:00Z", agent="a"), row("r3", "2025-04-30T00:00:00Z")]
    requests = relation_requests([claim()], rows)
    assert len(requests) == 1  # r2 is the claim's own agent, r3 is earlier
    seen = []
    model_link(claim(), rows, lambda p, t: seen.append((p, t)) or {"relation": "none"})
    assert requests == seen  # the estimate covers exactly what the linker sends


def test_model_link_through_the_cached_client_makes_no_calls_on_a_rerun(tmp_path):
    calls = []

    def transport(spec, system, user):
        calls.append(user)
        return Completion('{"relation": "corrects"}', 10, 5)

    spec = ModelSpec("test", "m")
    rows = [row("r1", "2025-05-01T01:00:00Z", text="that is wrong, revenue grew")]
    live = ModelClient(spec, transport, cache_path=tmp_path / "llm.sqlite", mode="live")
    first = model_link(claim(), rows, live.as_caller())
    live.close()

    offline = ModelClient(spec, cache_path=tmp_path / "llm.sqlite")
    assert model_link(claim(), rows, offline.as_caller()) == first
    assert [e.relation for e in first] == ["corrects"] and len(calls) == 1


def edge(claim_id, msg, relation="repeats"):
    return SpreadEdge(claim_id=claim_id, later_message_id=msg, relation=relation, agent="b", ts="2025-05-01T01:00:00Z")


def test_spread_share_intervals_gives_counts_and_a_wilson_interval_per_verdict():
    verdicts = [Verdict(f"c{i}", "contradicted" if i < 4 else "supported", [], "j", 0.9) for i in range(10)]
    out = spread_share_intervals(verdicts, [edge("c0", "r1"), edge("c1", "r2"), edge("c5", "r3", "corrects")], "repeats")
    assert (out["contradicted"]["k"], out["contradicted"]["n"], out["contradicted"]["share"]) == (2, 4, 0.5)
    assert (out["supported"]["k"], out["supported"]["n"]) == (0, 6)  # c5's edge is a correction, not a repeat
    assert out["contradicted"]["low"] < 0.5 < out["contradicted"]["high"]
    assert spread_share(verdicts, [edge("c0", "r1"), edge("c1", "r2")], "repeats") == {"contradicted": 0.5, "supported": 0.0}


def test_compare_linkers_counts_overlap_by_claim_and_message_whatever_the_relation():
    model = [edge("c1", "r1", "corrects"), edge("c1", "r2", "endorses")]
    baseline = [edge("c1", "r1"), edge("c2", "r9")]
    assert compare_linkers(model, baseline) == {"n_both": 1, "n_model_only": 1, "n_baseline_only": 1}


def test_sample_for_hand_check_is_reproducible_and_ignores_input_order():
    edges = [edge(f"c{i}", f"r{i}") for i in range(30)]
    first = sample_for_hand_check(edges, 5, seed=1)
    assert first == sample_for_hand_check(list(reversed(edges)), 5, seed=1)
    assert len(first) == 5 and len(sample_for_hand_check(edges[:3], 5)) == 3


def test_precision_scores_hand_judgements_with_an_interval():
    judged = {edge("c1", "r1"): True, edge("c2", "r2"): True, edge("c3", "r3"): False, edge("c4", "r4"): True}
    p = precision(judged)
    assert (p["n_judged"], p["n_correct"], p["precision"]) == (4, 3, 0.75)
    assert p["low"] < 0.75 < p["high"]


def timed_edge(claim_id, msg, relation, agent, ts):
    return SpreadEdge(claim_id=claim_id, later_message_id=msg, relation=relation, agent=agent, ts=ts)


def test_case_candidates_keeps_contradicted_claims_both_spread_and_challenged():
    verdicts = [Verdict("c1", "contradicted", [], "j", 1), Verdict("c2", "contradicted", [], "j", 1), Verdict("c3", "supported", [], "j", 1), Verdict("c4", "contradicted", [], "j", 1)]
    edges = [
        timed_edge("c1", "r1", "repeats", "b", "2025-05-01T01:00:00Z"),
        timed_edge("c1", "r2", "corrects", "d", "2025-05-01T02:00:00Z"),
        timed_edge("c2", "r3", "endorses", "b", "2025-05-01T01:00:00Z"),
        timed_edge("c2", "r4", "repeats", "c", "2025-05-01T01:30:00Z"),
        timed_edge("c2", "r5", "disputes", "d", "2025-05-01T03:00:00Z"),
        timed_edge("c3", "r6", "repeats", "b", "2025-05-01T01:00:00Z"),
        timed_edge("c3", "r7", "corrects", "d", "2025-05-01T02:00:00Z"),  # supported claim: not a case
        timed_edge("c4", "r8", "repeats", "b", "2025-05-01T01:00:00Z"),  # never challenged: not a case
    ]
    assert case_candidates(verdicts, edges) == ["c2", "c1"]  # c2 has more links


def test_documented_case_runs_from_the_claim_to_its_first_correction():
    c = claim(ts="2025-05-01T00:00:00Z", agent="alice", quote="the build passed")
    edges = [
        timed_edge("c1", "r2", "corrects", "dave", "2025-05-01T03:00:00Z"),
        timed_edge("c1", "r1", "repeats", "bob", "2025-05-01T01:00:00Z"),
        timed_edge("c1", "r3", "endorses", "bob", "2025-05-01T04:00:00Z"),
        timed_edge("c9", "r4", "corrects", "eve", "2025-05-01T00:30:00Z"),  # another claim
    ]
    assert documented_case(c, edges) == {"claim": "the build passed", "who_said_it": "alice", "who_repeated": "bob", "who_corrected": "dave", "duration": "3.0 hours"}
    assert "dave" in section_3_spread({}, [documented_case(c, edges)], {})  # fits the page as it is


def test_documented_case_without_a_correction_says_how_long_it_went_unchallenged():
    c = claim(ts="2025-05-01T00:00:00Z", agent="alice")
    case = documented_case(c, [timed_edge("c1", "r1", "repeats", "bob", "2025-05-04T00:00:00Z")])
    assert (case["who_corrected"], case["duration"]) == ("nobody", "unchallenged for at least 3.0 days")
    assert documented_case(c, [])["duration"] == "no later links"


def test_spread_svg_draws_one_row_per_relation_and_verdict_with_n():
    verdicts = [Verdict(f"c{i}", "contradicted" if i < 4 else "supported", [], "j", 0.9) for i in range(10)]
    edges = [edge("c0", "r1"), edge("c5", "r2", "corrects")]
    intervals = {"repeated": spread_share_intervals(verdicts, edges, "repeats"), "corrected <x>": spread_share_intervals(verdicts, edges, "corrects")}
    svg = spread_svg(intervals)
    assert svg.count("<circle") == 4 and "n=4" in svg and "n=6" in svg
    assert "corrected &lt;x&gt;, supported" in svg and "<script" not in svg


def test_section_3_spread_opens_with_the_chart_only_when_given_intervals():
    verdicts = [Verdict("c1", "contradicted", [], "j", 0.9)]
    with_chart = section_3_spread({"contradicted": 1.0}, [], {"contradicted": 0.0}, intervals={"repeated": spread_share_intervals(verdicts, [edge("c1", "r1")], "repeats")})
    assert "<svg" in with_chart and "<svg" not in section_3_spread({"contradicted": 1.0}, [], {"contradicted": 0.0})


def test_a_case_with_its_source_record_is_checked_verbatim_before_the_page_builds():
    c = claim(ts="2025-05-01T00:00:00Z", agent="alice", quote="the build passed")
    good = documented_case(c, [], record="alice: the build passed with 12 tests green")
    assert "build passed" in build_page([section_3_spread({}, [good], {})])

    bad = documented_case(replace(c, quote="the build passed cleanly"), [], record="alice: the build passed with 12 tests green")
    with pytest.raises(ValueError, match="not found verbatim"):
        build_page([section_3_spread({}, [bad], {})])


def test_section_3_says_when_fewer_than_three_cases_are_documented():
    case = documented_case(claim(), [])
    assert "1 of the three documented cases" in section_3_spread({}, [case], {})
    assert "of the three documented cases" not in section_3_spread({}, [case] * 3, {})


# Room timelines in the real export's timestamp style: UTC, no suffix.
TIMELINE = [("2026-03-01 09:00:00", "general"), ("2026-03-01 12:00:00", "builders")]


def test_room_at_reads_the_latest_move_at_or_before_a_time():
    assert room_at(TIMELINE, "2026-03-01 10:00:00") == "general"
    assert room_at(list(reversed(TIMELINE)), "2026-03-01 12:00:00") == "builders"
    assert room_at(TIMELINE, "2026-03-01 08:00:00") is None


def test_was_in_room_counts_being_there_at_the_start_or_entering_before_the_end():
    assert was_in_room(TIMELINE, "general", "2026-03-01 10:00:00", "2026-03-01 13:00:00") is True
    assert was_in_room(TIMELINE, "builders", "2026-03-01 10:00:00", "2026-03-01 13:00:00") is True  # entered at 12:00
    assert was_in_room(TIMELINE, "builders", "2026-03-01 10:00:00", "2026-03-01 11:00:00") is False
    assert was_in_room(TIMELINE, "general", "2026-03-01 07:00:00", "2026-03-01 08:00:00") is None  # nothing known


def test_visible_rows_drops_authors_who_were_never_in_the_claims_room():
    c = claim(ts="2026-03-01 10:00:00", agent="a")
    rows = [
        row("r1", "2026-03-01 11:00:00", agent="b"),  # in general all along
        row("r2", "2026-03-01 11:00:00", agent="c"),  # in builders the whole time
        row("r3", "2026-03-01 11:00:00", agent="d"),  # no timeline: kept, nothing rules it out
        row("r4", "2026-03-01 09:30:00", agent="b"),  # before the claim
    ]
    timelines = {"b": [("2026-03-01 08:00:00", "general")], "c": [("2026-03-01 08:00:00", "builders")]}
    assert [r["id"] for r in visible_rows(c, rows, "general", timelines)] == ["r1", "r3"]
    assert [r["id"] for r in visible_rows(c, rows, None, timelines)] == ["r1", "r2", "r3"]  # before rooms existed


def test_model_link_records_bad_replies_and_carries_on_when_asked():
    rows = [row(rid, f"2025-05-01T0{i}:00:00Z", text=rid) for i, rid in enumerate(["r1", "r2", "r3"], start=1)]
    replies = {"r1": {"relation": "corrects"}, "r2": ["not", "an", "object"]}

    def classifier(prompt, text):
        rid = text.rsplit("LATER MESSAGE: ", 1)[1]
        if rid not in replies:
            raise ReplyNotJSON("garbled")  # r3, as the cached client raises on unparseable text
        return replies[rid]

    failed = []
    edges = model_link(claim(), rows, classifier, failed=failed)
    assert [e.later_message_id for e in edges] == ["r1"]
    assert failed == ["r2", "r3"]


def test_model_link_still_stops_on_a_bad_reply_by_default():
    with pytest.raises(ReplyNotJSON):
        model_link(claim(), [row("r1", "2025-05-01T01:00:00Z")], lambda p, t: "supported")
