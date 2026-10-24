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
    assert out.count("<svg") == 2 and 'id="contradicted-by-model"' in out and 'id="contradicted-by-month"' in out
    assert out.count("<circle") == 4  # two models and two months, one dot each
    assert ">2025-06<" in out and "n=2" in out
