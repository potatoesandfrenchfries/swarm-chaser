"""The mock bundle: deterministic, shaped like the real stage outputs, plausible, and clearly marked as made up."""

import json
from collections import Counter

import pytest

from report.headline import headline
from report.mock import ACTIVE, JUDGES, VERDICTS, main, make_bundle
from report.page import section_3_spread, section_4_validation, section_5_decision_curve, section_6_sandbox


@pytest.fixture(scope="module")
def bundle():
    return make_bundle(0)


def test_the_same_seed_gives_the_same_bundle_and_another_seed_a_different_one(bundle):
    assert make_bundle(0) == bundle
    assert make_bundle(1) != bundle


def test_the_bundle_is_marked_as_mock_everywhere_a_reader_could_meet_it(bundle):
    assert bundle["mock"] is True and "mock" in bundle["title"].lower()
    assert all(c["claim"].startswith("(mock)") for c in bundle["spread"]["cases"])
    assert bundle["validation"]["table"][-1]["value"].startswith("(mock)")


def test_it_serialises_as_strict_json_with_no_nan_and_round_trips(bundle):
    text = json.dumps(bundle, allow_nan=False)  # raises on NaN or Infinity
    assert json.loads(text) == bundle


def test_records_have_the_shape_headline_takes_and_every_claim_is_judged_by_both_checkers(bundle):
    records = bundle["records"]
    assert all(set(r) == {"claim_id", "model", "ts", "verdict", "extractor", "judge"} for r in records)
    assert {r["verdict"] for r in records} <= set(VERDICTS) and {r["judge"] for r in records} == set(JUDGES)
    assert {r["extractor"] for r in records} == {"e1", "e2"}
    per_claim = Counter(r["claim_id"] for r in records)
    assert set(per_claim.values()) == {2}  # one verdict per checker, and the two extraction prompts never share an id
    h = headline(records)
    assert h["overall"]["n"] == len(records) and set(h["by_model"]) == {m for models in ACTIVE.values() for m in models}


def test_models_ran_in_different_months_so_the_confound_is_in_the_data(bundle):
    months_of = {}
    for r in bundle["records"]:
        months_of.setdefault(r["model"], set()).add(r["ts"][:7])
    assert any(len(m) < len(ACTIVE) for m in months_of.values())  # some model is missing from some month
    assert months_of["claude-opus-4-7"].isdisjoint({"2025-06", "2025-07"}) and months_of["o3-2025-04-16"].isdisjoint({"2026-06"})


def test_the_mix_looks_like_the_real_sample_unverifiable_most_and_contradicted_least(bundle):
    shares = headline(bundle["records"])["overall"]
    assert shares["unverifiable"]["p"] > shares["supported"]["p"] > shares["contradicted"]["p"]
    assert 0.05 < shares["contradicted"]["p"] < 0.30


def test_two_checkers_agree_a_fair_amount_but_not_perfectly_and_a_low_kappa_is_flagged(bundle):
    kappa_row = next(r for r in bundle["validation"]["table"] if r["measure"].startswith("Cohen"))
    kappa = float(kappa_row["value"].split()[0])
    assert 0.2 < kappa < 0.8 and "(" in kappa_row["value"]  # an interval is shown
    assert kappa_row["n"] == len({r["claim_id"] for r in bundle["records"]})
    if kappa < 0.6:
        assert "unreliable" in kappa_row["note"]


def test_false_claims_spread_and_get_corrected_more_than_supported_ones(bundle):
    repeated = bundle["spread"]["intervals"]["repeated"]
    corrected = bundle["spread"]["intervals"]["corrected"]
    assert repeated["contradicted"]["share"] > repeated["supported"]["share"]
    assert corrected["contradicted"]["share"] > corrected["supported"]["share"]
    assert all(0 <= s["low"] <= s["share"] <= s["high"] <= 1 for by in (repeated, corrected) for s in by.values())
    assert all(bundle["spread"]["baseline"][v] <= bundle["spread"]["shares"][v] + 0.05 for v in bundle["spread"]["shares"])


def test_the_ranking_beats_chance_at_every_review_budget(bundle):
    curves = bundle["decision"]["comparison"]["curves"]
    assert set(curves) == {"zero-shot score", "random"}
    from eval.decision_curve import REVIEW_BUDGETS, caught_at

    assert all(caught_at(curves["zero-shot score"], b) > caught_at(curves["random"], b) for b in REVIEW_BUDGETS)


def test_an_outside_llm_cuts_the_acting_rate_and_the_forecaster_beats_the_base_rate(bundle):
    handling = bundle["sandbox"]["handling"]
    assert handling["with_intervention"]["direct"]["rate"] < handling["without_intervention"]["rate"]
    f = bundle["sandbox"]["forecaster"]
    assert f["auc"] > 0.6 and f["brier"] < f["brier_base_rate"] and f["n"] == len(bundle["sandbox"]["predictions"])


def test_every_section_function_on_the_page_accepts_its_part_of_the_bundle(bundle):
    """Real stage outputs went in, so the real page code takes them back."""
    spread, decision, sandbox = bundle["spread"], bundle["decision"], bundle["sandbox"]
    assert "3. Spread" in section_3_spread(spread["shares"], spread["cases"], spread["baseline"], spread["intervals"])
    assert "4. Checker validation" in section_4_validation({}, bundle["validation"]["table"])
    assert "5. Decision curve" in section_5_decision_curve([], decision["comparison"])
    assert "6. Sandbox" in section_6_sandbox(sandbox["handling"], sandbox["forecaster"])


def test_the_whole_page_builds_from_the_bundle_once_the_builder_exists(bundle):
    build = pytest.importorskip("report.build")  # arrives with the chart branch; this test then starts to run
    page = build.render(bundle)
    assert build.MOCK_BANNER in page and "Not available" not in page


def test_the_cli_writes_the_bundle_and_rejects_bad_arguments(tmp_path, capsys):
    out = tmp_path / "sub" / "page_data.json"
    assert main([str(out), "--seed", "3"]) == 0
    assert json.loads(out.read_text()) == make_bundle(3) and "MOCK" in capsys.readouterr().out
    assert main([]) == 2 and main([str(out), "--seed", "x"]) == 2 and main([str(out), "--seed"]) == 2
