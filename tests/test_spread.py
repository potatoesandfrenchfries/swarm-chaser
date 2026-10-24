from check.checker import Verdict
from extract.claims import Claim
from spread.linker import SpreadEdge, baseline_link, could_have_seen, model_link, spread_share


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
