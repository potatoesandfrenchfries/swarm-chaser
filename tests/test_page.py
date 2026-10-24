from report.headline import headline
from report.page import build_page, section_1_headline, section_2_by_model_month


def rec(verdict, model="a", ts="2025-05-01T00:00:00Z", extractor="e1", judge="j1"):
    return {"claim_id": "c", "model": model, "ts": ts, "verdict": verdict, "extractor": extractor, "judge": judge}


def test_section_1_headline_renders_overall_shares():
    h = headline([rec("contradicted"), rec("supported")])
    out = section_1_headline(h)
    assert "<h2>1. Headline</h2>" in out
    assert "Contradicted" in out


def test_section_2_notes_model_time_confound():
    h = headline([rec("contradicted", model="a"), rec("supported", model="b")])
    out = section_2_by_model_month(h)
    assert "confounded" in out


def test_build_page_wraps_sections_and_adds_limits_note():
    page = build_page(["<h2>x</h2>"], title="test page")
    assert "<!doctype html>" in page
    assert "<h2>x</h2>" in page
    assert "LLM checkers" in page
    assert "test page" in page


def test_page_lists_its_limits():
    page = build_page([])
    assert "<h2>Limits</h2>" in page and "What this page does not show" in page
    assert "LLM-made" in page
    assert "confounded" in page


def test_section_2_charts_the_contradicted_share_of_each_model_and_month():
    h = headline([rec("contradicted", model="a"), rec("supported", model="a"), rec("supported", model="b", ts="2025-06-01T00:00:00Z")])
    out = section_2_by_model_month(h)
    assert out.count("<svg") == 3 and 'id="contradicted-by-model"' in out and 'id="contradicted-by-month"' in out and 'id="model-month-title"' in out
    assert out.count("<circle") == 4  # two models and two months, one dot each; the grid draws rectangles
    assert ">2025-06<" in out and "n=2" in out


# --- sandbox charts, gaps and the banner -------------------------------------------------------------


def _handling(without=(10, 6), strategies=None):
    n, k = without
    return {
        "without_intervention": {"arm": "planted_claim", "n": n, "k": k, "rate": k / n if n else float("nan")},
        "with_intervention": strategies if strategies is not None else {"direct": {"n": 10, "k": 2, "rate": 0.2, "difference_from_no_intervention": -0.4}},
    }


def test_section_6_charts_the_acting_rate_of_every_arm_that_has_runs():
    from report.page import section_6_sandbox

    out = section_6_sandbox(_handling(), {"n": 20})
    assert 'id="acting-rate-title"' in out and out.count("<circle") == 2 and "n=10" in out
    assert 'id="calibration-title"' not in out  # no predictions given, so no calibration chart


def test_section_6_leaves_an_arm_with_no_runs_out_of_the_chart_but_not_the_table():
    from report.page import section_6_sandbox

    out = section_6_sandbox(_handling(without=(0, 0)), {"n": 0})
    assert out.count("<circle") == 1 and "No intervention" in out and "n/a" in out


def test_section_6_adds_a_calibration_chart_when_it_is_given_predictions():
    from report.page import section_6_sandbox

    preds = [{"probability": 0.9, "outcome": True}, {"probability": 0.8, "outcome": False}, {"probability": 0.1, "outcome": False}]
    out = section_6_sandbox(_handling(), {"n": 3}, predictions=preds)
    assert 'id="calibration-title"' in out and out.count("<circle") == 2 + 2  # two acting-rate dots, two calibration bins


def test_section_6_with_every_arm_empty_draws_no_chart_and_does_not_crash():
    from report.page import section_6_sandbox

    out = section_6_sandbox(_handling(without=(0, 0), strategies={}), {"n": 0})
    assert "<svg" not in out


def test_an_unavailable_section_says_so_and_escapes_its_text():
    from report.page import unavailable_section

    out = unavailable_section("3. <Spread>", "needs a & b")
    assert "Not available" in out and "&lt;Spread&gt;" in out and "a &amp; b" in out


def test_the_banner_and_title_are_escaped_and_the_page_asks_for_light_and_dark_colours():
    page = build_page([], title="a <b>", banner="mock <data>")
    assert "mock &lt;data&gt;" in page and "a &lt;b&gt;" in page and "<data>" not in page
    assert "color-scheme:light dark" in page and "name='viewport'" in page


def test_forecaster_numbers_are_shown_to_three_decimals_and_missing_ones_as_n_a():
    from report.page import section_6_sandbox

    out = section_6_sandbox(_handling(), {"n": 56, "auc": 0.870304114490161, "brier": float("nan"), "gap": None})
    assert ">0.870<" in out and "0.8703" not in out and out.count(">n/a<") == 2 and ">56<" in out
