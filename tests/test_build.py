import json
import re

import pytest

from report.build import MOCK_BANNER, main, render, status
from report.quotes import REGISTRY


def rec(verdict, model="m1", ts="2025-06-01T00:00:00Z", extractor="e1", judge="j1", n=0):
    return {"claim_id": f"c{n}{verdict}{extractor}{judge}{model}", "model": model, "ts": ts, "verdict": verdict, "extractor": extractor, "judge": judge}


def point(i, n, caught):
    return {"claims_reviewed": i, "false_claims_caught": caught, "share_reviewed": i / n, "share_caught": caught / 2}


def full_bundle():
    return {
        "title": "test page",
        "records": [rec("contradicted", n=1), rec("supported", model="m2", ts="2026-06-01T00:00:00Z", n=2), rec("unverifiable", n=3, judge="j2")],
        "spread": {
            "shares": {"contradicted": 0.5, "supported": 0.1},
            "baseline": {"contradicted": 0.4, "supported": 0.1},
            "intervals": {"repeated": {"contradicted": {"k": 1, "n": 2, "share": 0.5, "low": 0.1, "high": 0.9}}},
            "cases": [{"claim": "x", "who_said_it": "a", "who_repeated": "b", "who_corrected": "c", "duration": "2 days"}],
        },
        "validation": {"table": [{"measure": "Perturbation", "value": "80%", "n": 10, "note": "not a false-positive rate"}]},
        "decision": {"comparison": {"curves": {"ranking": [point(1, 2, 1), point(2, 2, 2)], "random": [point(1, 2, 1), point(2, 2, 2)]}}},
        "sandbox": {
            "handling": {"without_intervention": {"arm": "planted_claim", "n": 10, "k": 6, "rate": 0.6}, "with_intervention": {"direct": {"n": 10, "k": 2, "rate": 0.2, "difference_from_no_intervention": -0.4}}},
            "forecaster": {"n": 4, "accuracy": 0.75, "brier": 0.2},
            "predictions": [{"probability": 0.9, "outcome": True}, {"probability": 0.1, "outcome": False}],
        },
    }


@pytest.fixture(autouse=True)
def clean_registry():
    REGISTRY.clear()
    yield
    REGISTRY.clear()


def test_a_full_bundle_gives_all_six_sections_and_their_charts():
    page = render(full_bundle())
    for heading in ("1. Headline", "2. By model and month", "3. Spread", "4. Checker validation", "5. Decision curve", "6. Sandbox"):
        assert heading in page
    assert "Not available" not in page
    for chart_id in ("headline-title", "model-month-title", "spread-title", "acting-rate-title", "calibration-title"):
        assert f'id="{chart_id}"' in page
    ids = re.findall(r' id="([^"]+)"', page)
    assert len(ids) == len(set(ids))  # a chart's title is found by id, so a repeat would label the wrong one


def test_a_section_with_no_data_says_what_it_needs_and_the_rest_still_build():
    bundle = {"records": full_bundle()["records"]}
    page = render(bundle)
    assert "1. Headline" in page and "2. By model and month" in page
    assert page.count("Not available") == 4
    assert "needs the ranked-claims comparison" in page and "needs verdict records" not in page
    assert status(bundle) == {1: True, 2: True, 3: False, 4: False, 5: False, 6: False}


def test_an_empty_bundle_is_a_page_of_gaps_not_a_crash():
    page = render({})
    assert page.count("Not available") == 6 and "Limits" in page
    assert render({"spread": {}}).count("Not available") == 6  # an empty section counts as no data, not as a broken one


def test_a_mock_bundle_carries_an_unmissable_banner_and_a_real_one_does_not():
    assert MOCK_BANNER in render({**full_bundle(), "mock": True})
    assert "class='banner'" not in render(full_bundle())
    assert "custom words" in render({**full_bundle(), "banner": "custom words"})


def test_a_section_missing_its_required_part_names_it():
    with pytest.raises(ValueError, match="'spread' is missing shares"):
        render({"spread": {"cases": []}})
    with pytest.raises(ValueError, match="'sandbox' is missing forecaster"):
        render({"sandbox": {"handling": {}}})


def test_json_nulls_in_the_decision_curves_come_back_as_nan_not_a_crash():
    bundle = full_bundle()
    bundle["decision"]["comparison"]["curves"]["random"] = [{**p, "share_caught": None} for p in bundle["decision"]["comparison"]["curves"]["random"]]
    assert "5. Decision curve" in render(json.loads(json.dumps(bundle)))


def test_the_cli_writes_the_page_and_reports_what_is_missing(tmp_path, capsys):
    src, out = tmp_path / "b.json", tmp_path / "site" / "index.html"
    src.write_text(json.dumps({**full_bundle(), "mock": True, "validation": None}))
    assert main([str(src), str(out)]) == 0
    text = capsys.readouterr().out
    assert "not available 4" in text and "MOCK banner on" in text
    assert out.read_text().startswith("<!doctype html>")


def test_the_cli_fails_cleanly_on_bad_input(tmp_path, capsys):
    assert main([]) == 2
    assert main([str(tmp_path / "nope.json"), str(tmp_path / "o.html")]) == 2
    bad = tmp_path / "bad.json"
    bad.write_text("{not json")
    assert main([str(bad), str(tmp_path / "o.html")]) == 2
    assert "cannot read" in capsys.readouterr().err
    broken = tmp_path / "broken.json"
    broken.write_text(json.dumps({"spread": {"cases": []}}))  # present, but without the shares it needs
    assert main([str(broken), str(tmp_path / "o.html")]) == 1 and not (tmp_path / "o.html").exists()
    assert "missing shares" in capsys.readouterr().err


def test_a_page_refuses_to_build_when_a_quoted_case_is_not_in_its_record():
    bundle = full_bundle()
    bundle["spread"]["cases"] = [{"claim": "never said", "record": "something else entirely", "who_said_it": "a", "who_repeated": "b", "who_corrected": "c", "duration": "1 day"}]
    with pytest.raises(ValueError, match="not found verbatim"):
        render(bundle)
