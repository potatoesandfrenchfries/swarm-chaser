from check.checker import Verdict, check_claim, evidence_window, window_text
from extract.claims import Claim


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
