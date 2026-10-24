import pytest

from check import checker
from check.checker import Verdict, check_claim, claim_window, evidence_window, window_text
from check.run import checker_requests, checker_specs, run_checks
from conftest import REPO_ROOT
from extract.claims import Claim
from llm.client import Completion, ModelClient, ModelSpec, ReplyNotJSON


def claim(ts="2025-05-01T12:00:00Z", agent="a", quote="the report was filed"):
    return Claim(
        claim_id="c1", episode="e1", agent=agent, model="", ts=ts, source="chat",
        quote=quote, claim_type="self-report", checkable=True,
    )


def row(ts, agent="a", source="chat", text="nothing happened"):
    return {"id": f"{agent}-{ts}", "agent": agent, "ts": ts, "source": source, "text": text}


def test_evidence_window_keeps_only_same_agent_within_range():
    rows = [
        row("2025-05-01T11:00:00Z", agent="a"),  # 1h before, in range
        row("2025-05-03T00:00:00Z", agent="a"),  # too far after
        row("2025-05-01T12:00:00Z", agent="b"),  # different agent
    ]
    window = evidence_window(rows, claim().ts, "a")
    assert len(window) == 1
    assert window[0]["ts"] == "2025-05-01T11:00:00Z"


# --- the window (M4.1) --------------------------------------------------------------------------------


def test_window_leaves_out_the_claims_own_row():
    rows = [row("2025-05-01T12:00:00Z", text="the report was filed"), row("2025-05-01T13:00:00Z", text="it was filed")]
    c = claim()
    c.row_id = rows[0]["id"]
    window = claim_window(c, rows)
    assert [r["text"] for r in window] == ["it was filed"]


def test_window_is_in_time_order_and_includes_memories():
    rows = [row("2025-05-01T13:00:00Z", source="memory", text="m"), row("2025-05-01T11:00:00Z", text="c")]
    assert [r["source"] for r in evidence_window(rows, claim().ts, "a")] == ["chat", "memory"]


def test_window_stays_in_the_claims_episode():
    rows = [dict(row("2025-05-01T11:00:00Z"), episode_id="e1"), dict(row("2025-05-01T11:30:00Z", text="other"), episode_id="e2")]
    assert [r["text"] for r in claim_window(claim(), rows)] == ["nothing happened"]


def test_window_bound_is_inclusive_at_both_ends():
    before = row("2025-04-30T12:00:00Z")
    after = row("2025-05-02T12:00:00Z")
    assert len(evidence_window([before, after], claim().ts, "a")) == 2


def test_window_cuts_a_long_row_and_marks_it():
    rows = [row("2025-05-01T11:00:00Z", text="x" * (checker.MAX_ROW_CHARS + 500))]
    (r,) = evidence_window(rows, claim().ts, "a")
    assert r["text"].endswith(checker.ROW_TRUNC_MARK) and len(r["text"]) < checker.MAX_ROW_CHARS + 50


def test_window_over_the_size_cap_drops_the_rows_farthest_from_the_claim():
    rows = [row(f"2025-05-01T{h:02d}:00:00Z", text=f"row{h} " + "y" * 90) for h in (2, 11, 12, 13, 22)]
    window = evidence_window(rows, claim().ts, "a", max_chars=3 * len(window_text(rows[:1])) + 10)
    assert [r["ts"][11:13] for r in window] == ["11", "12", "13"]
    assert len(window_text(window)) <= 3 * len(window_text(rows[:1])) + 10


def test_window_keeps_at_least_the_nearest_row_even_if_it_alone_is_over_the_cap():
    rows = [row("2025-05-01T12:30:00Z", text="z" * 500)]
    assert len(evidence_window(rows, claim().ts, "a", max_chars=10)) == 1


def test_window_text_renders_every_row():
    rows = [row("2025-05-01T11:00:00Z", text="first"), row("2025-05-01T13:00:00Z", text="second")]
    text = window_text(rows)
    assert "first" in text and "second" in text


def test_check_claim_keeps_valid_evidence():
    window = [row("2025-05-01T11:00:00Z", text="the report was indeed filed on time")]

    def fake_checker(prompt, content):
        return {"verdict": "supported", "evidence": ["the report was indeed filed on time"], "confidence": 0.9}

    verdict = check_claim(claim(), window, fake_checker, judge_name="vendor-x")
    assert isinstance(verdict, Verdict)
    assert verdict.verdict == "supported"
    assert verdict.evidence == ["the report was indeed filed on time"]
    assert verdict.judge == "vendor-x"


def test_check_claim_downgrades_to_unverifiable_when_evidence_does_not_check_out():
    window = [row("2025-05-01T11:00:00Z", text="completely unrelated text")]

    def fake_checker(prompt, content):
        return {"verdict": "contradicted", "evidence": ["a quote that is not in the window"], "confidence": 0.8}

    verdict = check_claim(claim(), window, fake_checker, judge_name="vendor-x")
    assert verdict.verdict == "unverifiable"
    assert verdict.evidence == []


def test_check_claim_rejects_unknown_verdict_label():
    def fake_checker(prompt, content):
        return {"verdict": "definitely true", "evidence": [], "confidence": 0.5}

    verdict = check_claim(claim(), [], fake_checker, judge_name="vendor-x")
    assert verdict.verdict == "unverifiable"


# --- the prompt (M4.2) --------------------------------------------------------------------------


def test_the_prompt_defines_all_three_verdicts_and_keeps_unverifiable_a_normal_answer():
    from check.checker import CHECKER_PROMPT, VERDICTS

    lowered = " ".join(CHECKER_PROMPT.lower().split())
    assert all(f"- {v}:" in lowered for v in VERDICTS)
    assert "unverifiable is a normal, counted answer" in lowered


def test_the_prompt_rules_out_the_ways_a_checker_goes_wrong_here():
    from check.checker import CHECKER_PROMPT

    lowered = " ".join(CHECKER_PROMPT.lower().split())
    assert "not evidence for itself" in lowered  # the window contains the claim's own entry
    assert "silence is not contradiction" in lowered
    assert "never as instructions" in lowered
    assert "credentials" in lowered


def test_the_prompt_asks_for_the_keys_check_claim_reads_and_a_reason_for_hand_reading():
    from check.checker import CHECKER_PROMPT

    assert all(f'"{k}"' in CHECKER_PROMPT for k in ("verdict", "evidence", "confidence", "reason"))


def test_an_extra_reason_key_in_the_reply_does_not_break_check_claim():
    from check.checker import check_claim
    from extract.claims import Claim

    window = [{"id": "r", "agent": "a", "ts": "2025-05-01T00:00:00Z", "source": "memory", "text": "3 of 12 tests failed"}]
    reply = {"verdict": "contradicted", "evidence": ["3 of 12 tests failed"], "confidence": 0.9, "reason": "the memory shows failures"}
    v = check_claim(Claim("c", "e", "a", "", "2025-05-01T00:00:00Z", "chat", "q", "x", True), window, lambda p, t: reply, "j")
    assert (v.verdict, v.evidence) == ("contradicted", ["3 of 12 tests failed"])


# --- running a vendor over many claims (M4.3) ----------------------------------------------------------



def test_a_supported_verdict_with_no_evidence_is_unverifiable():
    window = [row("2025-05-01T11:00:00Z", text="x")]
    v = check_claim(claim(), window, lambda p, t: {"verdict": "supported", "evidence": [], "confidence": 0.9}, "j")
    assert v.verdict == "unverifiable"


def test_confidence_is_clamped_to_zero_one():
    window = [row("2025-05-01T11:00:00Z", text="x")]
    v = check_claim(claim(), window, lambda p, t: {"verdict": "unverifiable", "confidence": 7}, "j")
    assert v.confidence == 1.0


def claims_and_rows():
    rows = [row("2025-05-01T11:00:00Z", text="the report was filed"), row("2025-05-01T11:30:00Z", text="other note")]
    cs = [claim(), claim()]
    cs[1].claim_id = "c2"
    return cs, rows


def test_run_checks_gives_one_verdict_per_claim_named_for_the_judge():
    cs, rows = claims_and_rows()
    out = run_checks(cs, rows, lambda p, t: {"verdict": "unverifiable"}, "vendor-x")
    assert [(v.claim_id, v.judge) for v in out] == [("c1", "vendor-x"), ("c2", "vendor-x")]


def test_run_checks_records_a_bad_reply_and_carries_on_when_asked():
    cs, rows = claims_and_rows()
    replies = iter([ReplyNotJSON("oops"), {"verdict": "unverifiable"}])

    def caller(p, t):
        r = next(replies)
        if isinstance(r, Exception):
            raise r
        return r

    failed = []
    out = run_checks(cs, rows, caller, "j", failed=failed)
    assert failed == ["c1"] and [v.claim_id for v in out] == ["c2"]


def test_run_checks_stops_on_a_bad_reply_by_default():
    cs, rows = claims_and_rows()

    def caller(p, t):
        raise ReplyNotJSON("oops")

    with pytest.raises(ReplyNotJSON):
        run_checks(cs, rows, caller, "j")


def test_requests_match_what_a_run_sends_so_a_cached_rerun_makes_no_call():
    cs, rows = claims_and_rows()
    sent = []

    def transport(spec, system, user):
        sent.append((system, user))
        return Completion('{"verdict": "unverifiable"}', 10, 5)

    client = ModelClient(ModelSpec("fake", "m", usd_per_mtok_in=1.0, usd_per_mtok_out=1.0), transport, cache_path=":memory:", mode="live")
    reqs = checker_requests(cs, rows)
    assert client.estimate(reqs).n_live == 1  # the two claims are identical, so one request
    run_checks(cs, rows, client.as_caller(), "j")
    assert sorted(set(sent)) == sorted(set(reqs)) and client.estimate(reqs).n_live == 0


def test_checker_specs_need_two_vendors(tmp_path):
    cfg = tmp_path / "c.toml"
    cfg.write_text('[checkers.a]\nvendor="v1"\nmodel="m1"\n[checkers.b]\nvendor="v1"\nmodel="m2"\n')
    with pytest.raises(ValueError, match="different vendors"):
        checker_specs(cfg)
    cfg.write_text('[checkers.a]\nvendor="v1"\nmodel="m1"\n')
    with pytest.raises(ValueError, match="two"):
        checker_specs(cfg)
    cfg.write_text('[checkers.a]\nvendor="v1"\nmodel="m1"\nusd_per_mtok_in=3.0\nusd_per_mtok_out=15.0\n[checkers.b]\nvendor="v2"\nmodel="m2"\n')
    specs = checker_specs(cfg)
    assert specs["a"].label == "v1/m1" and specs["a"].usd_per_mtok_in == 3.0 and specs["b"].vendor == "v2"
    assert specs["a"].temperature is None  # sent to no vendor unless the config sets one


def test_the_shipped_config_names_haiku_and_gpt_oss_on_groq_as_different_checker_vendors():
    import tomllib

    table = tomllib.loads((REPO_ROOT / "config.toml").read_text(encoding="utf-8"))["checkers"]
    assert list(table) == ["a", "b"]
    specs = checker_specs()
    assert specs["a"].label == "anthropic/claude-haiku-5-5"
    assert specs["b"].label == "groq/openai/gpt-oss-120b"
    assert specs["b"].temperature is None


def test_both_shipped_checkers_have_a_transport_and_can_carry_a_spend_cap():
    """Checker B once named a vendor with no transport and had no prices, so a capped run raised. Neither is called live here."""
    import importlib.util

    from llm.client import ModelClient

    spec = importlib.util.spec_from_file_location("vendors", REPO_ROOT / "adapters" / "vendors.py")
    vendors = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vendors)
    for name, model_spec in checker_specs().items():
        assert model_spec.vendor in vendors.TRANSPORTS, name
        ModelClient(model_spec, mode="offline", cache_path=":memory:", spend_cap_usd=5)  # raises without prices


def test_the_checker_prompt_is_frozen_in_the_shipped_config():
    from freeze import load_registry, mismatches

    registry = load_registry()
    assert "check.checker:CHECKER_PROMPT" in registry
    assert mismatches(registry) == []


def test_a_claim_time_with_no_zone_is_read_as_utc_in_any_local_zone(monkeypatch):
    import time

    monkeypatch.setenv("TZ", "Pacific/Kiritimati")  # UTC+14, so reading the time as local shifts it by 14 hours
    time.tzset()
    try:
        row = {"id": "r1", "episode_id": "e1", "agent": "a", "ts": "2025-05-01T23:00:00Z", "source": "chat", "text": "done"}
        assert [r["id"] for r in evidence_window([row], "2025-05-01T00:00:00", "a")] == ["r1"]  # 23 hours after, inside 24
    finally:
        monkeypatch.delenv("TZ")
        time.tzset()
