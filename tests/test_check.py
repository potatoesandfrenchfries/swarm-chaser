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
