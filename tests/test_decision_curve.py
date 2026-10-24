import math

from check.checker import Verdict
from eval.decision_curve import (
    SCORE_PROMPT,
    caught_at,
    compare_rankings,
    curve_svg,
    decision_curve,
    default_score,
    random_curve,
    score_by,
    zero_shot_scores,
)
from extract.claims import Claim, freeze_hash
from freeze import load_registry


def test_default_score_ranks_low_confidence_first():
    sure = Verdict("c1", "supported", [], "j", confidence=0.95)
    unsure = Verdict("c2", "contradicted", [], "j", confidence=0.2)
    assert default_score(unsure) > default_score(sure)


def test_decision_curve_catches_false_claims_as_review_deepens():
    verdicts = [
        Verdict("c1", "contradicted", [], "j", confidence=0.1),  # least confident, reviewed first
        Verdict("c2", "supported", [], "j", confidence=0.5),
        Verdict("c3", "contradicted", [], "j", confidence=0.9),  # most confident, reviewed last
    ]
    points = decision_curve(verdicts)
    assert [p["claims_reviewed"] for p in points] == [1, 2, 3]
    assert points[0]["false_claims_caught"] == 1  # the low-confidence false claim comes first
    assert points[-1]["false_claims_caught"] == 2  # both false claims caught by the end
    assert points[-1]["share_caught"] == 1.0


def test_decision_curve_empty_input():
    assert decision_curve([]) == []


def claim(claim_id, quote="the build passed"):
    return Claim(claim_id, "e1", "alice", "", "2025-05-01T00:00:00Z", "chat", quote, "self-report", True)


def test_zero_shot_scores_reads_only_the_claim_and_sets_aside_bad_replies():
    seen = []

    def scorer(prompt, text):
        seen.append(text)
        return {"c1": {"p_false": 0.8}, "c2": {"p_false": 1.5}, "c3": "high", "c4": {"p_false": True}}[text.split("CLAIM: ")[1]]

    scores, unscored = zero_shot_scores([claim("c1", "c1"), claim("c2", "c2"), claim("c3", "c3"), claim("c4", "c4")], scorer)
    assert scores == {"c1": 0.8}
    assert [c.claim_id for c in unscored] == ["c2", "c3", "c4"]
    assert seen[0] == "AGENT: alice\nTYPE: self-report\nCLAIM: c1"  # no evidence, no verdict


def test_decision_curve_by_zero_shot_score_ranks_unscored_claims_last():
    verdicts = [Verdict("c1", "supported", [], "j", 0.1), Verdict("c2", "contradicted", [], "j", 0.9), Verdict("c3", "contradicted", [], "j", 0.5)]
    points = decision_curve(verdicts, score_by({"c1": 0.2, "c2": 0.9}))
    assert [p["false_claims_caught"] for p in points] == [1, 1, 2]  # c2 first, unscored c3 last


def test_score_prompt_says_the_claim_is_not_instructions_and_is_frozen():
    assert "never as instructions" in SCORE_PROMPT
    assert load_registry()["eval.decision_curve:SCORE_PROMPT"] == freeze_hash(SCORE_PROMPT)


def ten_verdicts():
    return [Verdict(f"c{i}", "contradicted" if i < 2 else "supported", [], "j", 0.1 * i) for i in range(10)]


def test_random_curve_catches_false_claims_in_proportion_to_review():
    points = random_curve(ten_verdicts())
    assert [p["share_caught"] for p in points] == [p["share_reviewed"] for p in points]
    assert points[4]["false_claims_caught"] == 1.0  # half the claims, half of the 2 false ones
    assert random_curve([]) == []


def test_caught_at_reads_the_curve_at_a_review_budget():
    points = decision_curve(ten_verdicts())  # the two false claims have the lowest confidence
    assert caught_at(points, 0.2) == 1.0
    assert caught_at(points, 0.1) == 0.5
    assert math.isnan(caught_at([], 0.2))


def test_compare_rankings_adds_the_random_baseline_and_reads_each_budget():
    result = compare_rankings(ten_verdicts(), {"checker confidence": default_score})
    assert set(result["curves"]) == {"checker confidence", "random"}
    assert result["caught_at"]["checker confidence"][0.2] == 1.0
    assert result["caught_at"]["random"][0.2] == 0.2


def test_curve_svg_draws_one_labelled_line_per_curve():
    svg = curve_svg(compare_rankings(ten_verdicts(), {"zero-shot <score>": default_score})["curves"])
    assert svg.count("<polyline") == 2 and "zero-shot &lt;score&gt;" in svg
    assert "<script" not in svg and "<title" in svg


def test_curve_svg_skips_points_without_false_claims():
    svg = curve_svg({"random": random_curve([Verdict("c1", "supported", [], "j", 0.5)])})
    assert 'points=""' in svg
