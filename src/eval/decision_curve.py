"""Decision curve: review effort against false claims caught (scope.md section 1 "Decision";
MVP.md M8).

Rank claims by a zero-shot score (no fitted model — stays clear of the no-training clause,
same reasoning as the forecaster), then plot how many of the false claims a reviewer would
catch as a function of how many of the top-ranked claims they review.

CUSTOMISE: `default_score` is a placeholder ranking (lower checker confidence first, since a
checker should be less sure about claims worth a human's time). Replace it with whatever
zero-shot score you actually use for the results page — for example the checker's own
confidence, or disagreement between the two vendors from `eval/validation.agreement_report`.
"""


def default_score(verdict) -> float:
    """Placeholder zero-shot score: lower checker confidence ranks a claim higher for review.
    CUSTOMISE: a confidence-only score ignores disagreement between vendors entirely; a
    better default might combine (1 - confidence) with the two vendors' verdicts disagreeing.
    """
    return 1.0 - verdict.confidence


def decision_curve(verdicts: list, score_fn=default_score) -> list[dict]:
    """Points (claims_reviewed, false_claims_caught) as the reviewer works down the ranked
    list. "False" here means verdict == "contradicted"; `score_fn` ranks highest-score first.
    """
    ranked = sorted(verdicts, key=score_fn, reverse=True)
    total_false = sum(v.verdict == "contradicted" for v in ranked)
    points, caught = [], 0
    for i, v in enumerate(ranked, start=1):
        if v.verdict == "contradicted":
            caught += 1
        points.append(
            {
                "claims_reviewed": i,
                "false_claims_caught": caught,
                "share_reviewed": i / len(ranked) if ranked else float("nan"),
                "share_caught": caught / total_false if total_false else float("nan"),
            }
        )
    return points
