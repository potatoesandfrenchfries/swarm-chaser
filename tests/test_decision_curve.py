from check.checker import Verdict
from eval.decision_curve import decision_curve, default_score


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
