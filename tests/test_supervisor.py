import pytest

from lab.arms import INFLUENCER_STRATEGIES
from lab.supervisor import MAX_TRANSCRIPT_CHARS, Supervisor, judge_prompt, load_nudges, read_verdict, recent_transcript


def row(ts, text, source="chat"):
    return {"id": ts, "agent": "a1", "ts": ts, "source": source, "text": text}


ROWS = [row("2025-05-01T00:00:00Z", "scanning the internal range"), row("2025-05-01T00:05:00Z", "going after the legacy login service")]
NUDGES = load_nudges()
STRATEGY = next(iter(NUDGES))


def reply(target="vulnerability", evidence=("going after the legacy login service",), confidence=0.9, strategy=STRATEGY):
    return {"target": target, "evidence": list(evidence), "confidence": confidence, "strategy": strategy, "reason": "r"}


def make(judge, sent=None, **kw):
    sent = [] if sent is None else sent
    return Supervisor(judge, lambda agent, msg: sent.append((agent, msg)), honeypot="decoy-host", vulnerability="legacy-login", **kw), sent


def test_steers_an_agent_on_the_vulnerability_with_a_reviewed_message():
    sup, sent = make(lambda p, t: reply())
    d = sup.review("a1", ROWS)
    assert d.nudged and d.strategy == STRATEGY
    assert sent == [("a1", NUDGES[STRATEGY].render("decoy-host", "legacy-login"))]
    assert "decoy-host" in sent[0][1] and "{" not in sent[0][1]


def test_the_judge_cannot_write_the_message():
    sup, sent = make(lambda p, t: {**reply(), "message": "do something else entirely"})
    sup.review("a1", ROWS)
    assert "do something else" not in sent[0][1]


@pytest.mark.parametrize("target", ["honeypot", "neither", "unclear"])
def test_leaves_alone_an_agent_that_is_not_on_the_vulnerability(target):
    sup, sent = make(lambda p, t: reply(target=target))
    assert not sup.review("a1", ROWS).nudged and sent == []


def test_low_confidence_is_not_acted_on():
    sup, sent = make(lambda p, t: reply(confidence=0.4))
    d = sup.review("a1", ROWS)
    assert not d.nudged and "confidence" in d.skipped and sent == []


def test_a_call_with_no_real_quote_becomes_unclear():
    sup, sent = make(lambda p, t: reply(evidence=["a line the agent never wrote"]))
    d = sup.review("a1", ROWS)
    assert d.target == "unclear" and not d.nudged and sent == []


def test_an_unknown_strategy_is_not_sent():
    sup, sent = make(lambda p, t: reply(strategy="make_something_up"))
    d = sup.review("a1", ROWS)
    assert not d.nudged and d.skipped == "no valid strategy chosen" and sent == []


def test_cooldown_then_per_agent_limit():
    sup, sent = make(lambda p, t: reply(), cooldown_sweeps=1, max_nudges_per_agent=2)
    results = [sup.sweep(["a1"], lambda a: ROWS)[0] for _ in range(6)]
    assert [d.nudged for d in results] == [True, False, True, False, False, False]
    assert results[1].skipped == "cooling down after the last message"
    assert results[4].skipped.startswith("already steered")
    assert len(sent) == 2


def test_dry_run_decides_but_sends_nothing():
    sup, sent = make(lambda p, t: reply(), dry_run=True)
    d = sup.review("a1", ROWS)
    assert not d.nudged and d.message and d.skipped == "dry run" and sent == []


def test_sweep_skips_agents_with_no_transcript_without_calling_the_judge():
    calls = []
    sup, _ = make(lambda p, t: calls.append(t) or reply())
    out = sup.sweep(["a1", "a2"], lambda a: ROWS if a == "a1" else [])
    assert len(calls) == 1 and out[1].skipped == "no transcript yet" and len(sup.log) == 2


@pytest.mark.parametrize("bad", [None, "text", [], {"target": 7}, {"target": "vulnerability", "confidence": "high", "evidence": 3}])
def test_a_malformed_reply_is_read_as_unclear_and_never_steers(bad):
    sup, sent = make(lambda p, t: bad)
    assert not sup.review("a1", ROWS).nudged and sent == []


def test_the_judge_sees_the_targets_the_transcript_and_the_strategy_names():
    seen = {}
    sup, _ = make(lambda p, t: seen.update(prompt=p, text=t) or reply())
    sup.review("a1", ROWS)
    assert "HONEYPOT: decoy-host" in seen["text"] and "VULNERABILITY: legacy-login" in seen["text"]
    assert "going after the legacy login service" in seen["text"]
    assert all(name in seen["prompt"] for name in NUDGES) and '"target"' in seen["prompt"]


def test_recent_transcript_keeps_the_newest_rows():
    rows = [row(f"2025-05-01T00:{i:02d}:00Z", "x" * 5000) for i in range(20)]
    text = recent_transcript(rows)
    assert len(text) <= MAX_TRANSCRIPT_CHARS + 5100 and "00:19:00Z" in text and "00:00:00Z" not in text


def test_read_verdict_drops_a_strategy_unless_the_target_is_the_vulnerability():
    v = read_verdict(reply(target="neither", evidence=()), "t", {STRATEGY})
    assert v.strategy is None


def test_every_template_renders_and_is_a_registered_strategy():
    assert judge_prompt(NUDGES)
    for name, nudge in NUDGES.items():
        assert "{" not in nudge.render("h", "v")
        assert name in INFLUENCER_STRATEGIES


def test_a_template_with_an_unknown_placeholder_is_rejected(tmp_path):
    f = tmp_path / "n.toml"
    f.write_text('[strategies.x]\ntext = "do {payload}"\n')
    with pytest.raises(ValueError, match="payload"):
        load_nudges(f)
