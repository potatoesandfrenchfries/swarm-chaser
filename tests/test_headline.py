import math

import pytest

from report.headline import breakdown, headline, month, sensitivity, shares, wilson


def rec(verdict, model="a", ts="2025-05-01T00:00:00Z", extractor="e1", judge="j1"):
    return {"claim_id": "c", "model": model, "ts": ts, "verdict": verdict, "extractor": extractor, "judge": judge}


def test_wilson_known_value():
    # 8 of 10 at z=1.96 is the standard worked example: 0.490 to 0.943.
    p, lo, hi = wilson(8, 10)
    assert p == 0.8
    assert lo == pytest.approx(0.490, abs=1e-3)
    assert hi == pytest.approx(0.943, abs=1e-3)


def test_wilson_edges_stay_in_unit_interval():
    for k in (0, 10):
        _, lo, hi = wilson(k, 10)
        assert 0.0 <= lo <= hi <= 1.0
    assert wilson(0, 10)[1] == 0.0
    assert wilson(10, 10)[2] == 1.0


def test_wilson_empty_group_is_nan():
    assert all(math.isnan(x) for x in wilson(0, 0))


def test_shares_keeps_three_verdicts_separate():
    s = shares([rec("contradicted"), rec("supported"), rec("supported"), rec("unverifiable")])
    assert s["n"] == 4
    assert (s["contradicted"]["k"], s["supported"]["k"], s["unverifiable"]["k"]) == (1, 2, 1)
    assert s["supported"]["p"] == 0.5


def test_shares_rejects_unknown_verdict():
    with pytest.raises(ValueError):
        shares([rec("maybe")])


def test_breakdown_by_model_and_month():
    records = [
        rec("contradicted", model="a", ts="2025-05-02T00:00:00Z"),
        rec("supported", model="a", ts="2025-06-02T00:00:00Z"),
        rec("supported", model="b", ts="2025-06-03T00:00:00Z"),
    ]
    assert breakdown(records, "model")["a"]["n"] == 2
    by_month = breakdown(records, month)
    assert list(by_month) == ["2025-05", "2025-06"]
    assert by_month["2025-06"]["n"] == 2


def test_sensitivity_range_spans_settings():
    records = (
        [rec("contradicted")] * 1 + [rec("supported")] * 3  # e1/j1: 25% contradicted
        + [rec("contradicted", judge="j2")] * 2 + [rec("supported", judge="j2")] * 2  # e1/j2: 50%
    )
    s = sensitivity(records)
    assert len(s["per_setting"]) == 2
    assert s["range"]["contradicted"] == {"min": 0.25, "max": 0.5}


def test_headline_has_all_sections():
    h = headline([rec("contradicted"), rec("supported")])
    assert set(h) == {"overall", "sensitivity", "by_model", "by_month", "by_model_month"}
