"""The src/stats statistics, checked against mock data with planted effects (stats.mock).

Each test asks whether a statistic recovers what the generator put in, which is the only check available while
the real sample is too small to run them on (stats.audit). None of this is village data.
"""
import math
from pathlib import Path

import pytest

from eval.forecaster import Prediction, auc
from eval.validation import cohen_kappa, perturbation_test
from extract.claims import Claim
from report.headline import wilson
from stats import audit, mock
from stats.agreement import confusion_matrix, gwet_ac1, mcnemar_exact, positive_specific_agreement, stuart_maxwell
from stats.cascade import kaplan_meier, km_median, logrank, time_to_first
from stats.catalogue import CATALOGUE
from stats.checker_controls import control_edit_test, cosmetic_edit, net_catch, perturbation_intervals
from stats.clustering import cluster_bootstrap_share, icc
from stats.contrast import fisher_p, min_detectable_difference, number_needed, required_n_per_arm, risk_difference
from stats.forecast import _rank_auc, auc_interval, brier_skill_score, expected_calibration_error, reliability_bins
from stats.maths import binom_two_sided_half, chi2_sf, fisher_two_sided, norm_ppf, norm_sf, solve
from stats.timeseries import change_point, cochran_armitage, lag1_autocorrelation, longest_run, monthly_series, trend_logit


@pytest.fixture(scope="module")
def step():
    return mock.mock_dataset("step")


@pytest.fixture(scope="module")
def trend():
    return mock.mock_dataset("trend")


@pytest.fixture(scope="module")
def null():
    return mock.mock_dataset("null")


# --- mock data -------------------------------------------------------------------------


def test_mock_is_deterministic_and_marked(step):
    again = mock.mock_dataset("step")
    assert again["claims"] == step["claims"] and again["verdicts"] == step["verdicts"] and again["edges"] == step["edges"]
    assert all(c["claim_id"].startswith("mock-") and c["model"].startswith("mock-") for c in step["claims"])
    assert {v["judge"] for v in step["verdicts"]} == set(mock.JUDGES)
    assert Path("local/sample_run") not in (mock.OUT_DIR, mock.OUT_DIR.parent)


def test_mock_claims_have_the_real_claim_shape(step):
    Claim(**step["claims"][0])  # raises on an unknown or missing field


def test_mock_models_overlap_only_in_part_of_the_period(step):
    months = {}
    for c in step["claims"]:
        months.setdefault(c["model"], set()).add(c["ts"][:7])
    assert len(months) == 4 and all(len(m) < 18 for m in months.values())


# --- contrast ----------------------------------------------------------------------------


def test_risk_difference_interval_holds_the_difference():
    r = risk_difference(30, 40, 10, 40)
    assert r["difference"] == pytest.approx(0.5)
    assert r["low"] < 0.5 < r["high"] and 0.2 < r["low"] and r["high"] < 0.75
    assert math.isnan(risk_difference(1, 0, 1, 5)["difference"])


def test_risk_difference_of_equal_shares_straddles_zero():
    r = risk_difference(10, 40, 10, 40)
    assert r["difference"] == 0 and r["low"] < 0 < r["high"]


def test_fisher_and_sample_size():
    assert fisher_p(30, 40, 10, 40) < 0.001
    assert fisher_p(10, 40, 10, 40) == pytest.approx(1.0)
    assert required_n_per_arm(0.6, 0.25) == 32
    assert required_n_per_arm(0.5, 0.5) == 0
    assert min_detectable_difference(100, 100) < min_detectable_difference(20, 20)
    assert number_needed(-0.25) == pytest.approx(4) and number_needed(0) == math.inf


# --- time series -------------------------------------------------------------------------


def test_monthly_series_fills_gaps():
    records = [{"ts": "2025-01-05T00:00:00Z", "verdict": "contradicted"}, {"ts": "2025-04-05T00:00:00Z", "verdict": "supported"}]
    assert monthly_series(records) == [("2025-01", 1, 1), ("2025-02", 0, 0), ("2025-03", 0, 0), ("2025-04", 0, 1)]
    assert longest_run(monthly_series(records)) == 1
    assert monthly_series([]) == []


def test_trend_is_found_in_the_trend_scenario_and_not_in_the_null(trend, null):
    for data, found in ((trend, True), (null, False)):
        ca = cochran_armitage(monthly_series(data["records"]))
        logit = trend_logit(data["records"])
        assert (ca["p"] < 1e-6) is found
        assert (logit["low"] > 1) is found
        if not found:
            assert logit["low"] < 1 < logit["high"]
    assert cochran_armitage(monthly_series(trend["records"]))["slope_per_month"] > 0.005


def test_change_point_lands_on_the_planted_month(step, null):
    found = change_point(step["records"])
    assert found["after"] == step["truth"]["change_label"] and found["p"] < 0.01
    assert found["share_after"] > found["share_before"]
    assert change_point(null["records"])["p"] > 0.05


def test_time_series_statistics_say_nothing_when_there_is_nothing_to_test():
    one_month = [{"ts": "2025-01-05T00:00:00Z", "verdict": "supported", "agent": "a"}] * 5
    assert math.isnan(cochran_armitage(monthly_series(one_month))["z"])
    assert math.isnan(trend_logit(one_month)["odds_ratio_per_month"])
    assert change_point(one_month)["after"] is None
    assert math.isnan(lag1_autocorrelation(monthly_series(one_month)))


def test_change_point_is_repeatable(step):
    assert change_point(step["records"]) == change_point(step["records"])


# --- clustering --------------------------------------------------------------------------


def test_agent_effect_shows_up_as_clustering(step):
    r = icc(step["records"])
    assert r["icc"] > 0.02 and r["design_effect"] > 2 and r["n_clusters"] == 24


def test_cluster_interval_is_wider_than_wilson(step):
    c = cluster_bootstrap_share(step["records"])
    k = sum(r["verdict"] == "contradicted" for r in step["records"])
    p, low, high = wilson(k, len(step["records"]))
    assert c["p"] == pytest.approx(p) and (c["high"] - c["low"]) > 1.5 * (high - low)


def test_clustering_with_no_records():
    assert math.isnan(cluster_bootstrap_share([])["p"]) and math.isnan(icc([])["icc"])


# --- checker agreement -------------------------------------------------------------------


def _labels(data):
    a = [v["verdict"] for v in data["verdicts"] if v["judge"] == mock.JUDGES[0]]
    b = [v["verdict"] for v in data["verdicts"] if v["judge"] == mock.JUDGES[1]]
    return a, b


def test_harsher_judge_is_found_though_kappa_is_fair(step):
    a, b = _labels(step)
    assert cohen_kappa(a, b) > 0.6
    assert stuart_maxwell(a, b)["p"] < 1e-4
    lean = mcnemar_exact(a, b, "unverifiable")
    assert lean["only_b"] > lean["only_a"] and lean["p"] < 1e-4
    assert sum(map(sum, confusion_matrix(a, b))) == len(a)


def test_agreement_edge_cases():
    same = ["supported", "contradicted", "supported", "unverifiable"]
    assert gwet_ac1(same, same) == pytest.approx(1.0)
    assert stuart_maxwell(same, same)["p"] == 1.0
    assert positive_specific_agreement(same, same, "contradicted") == 1.0
    assert math.isnan(positive_specific_agreement(same, same, "nothing"))
    assert math.isnan(gwet_ac1([], []))
    assert mcnemar_exact(same, same, "supported")["p"] == 1.0


def test_ac1_stays_high_where_kappa_collapses():
    a = ["supported"] * 95 + ["contradicted"] * 5
    b = ["supported"] * 90 + ["contradicted"] * 5 + ["supported"] * 5
    assert gwet_ac1(a, b) > cohen_kappa(a, b) + 0.3


# --- perturbation controls ---------------------------------------------------------------


def test_control_edit_and_net_catch(step):
    supported = [Claim(**c) for c in step["claims"][:300]]
    original = {c.claim_id: cosmetic_edit(c.quote).rstrip(".") for c in supported}

    def checker(claim):  # supported only while the words and numbers are the originals
        return "supported" if claim.quote.rstrip(".").strip() == original[claim.claim_id] else "contradicted"

    by_kind: dict = {}
    perturbation = perturbation_test(supported, checker, by_kind=by_kind)
    control = control_edit_test(supported, checker)
    assert control["share_flipped"] == 0 and control["n"] == 300
    assert perturbation["share_caught"] == 1.0
    net = net_catch(perturbation, control)
    assert net["difference"] == pytest.approx(1.0) and net["low"] > 0.9
    intervals = perturbation_intervals(perturbation, by_kind)
    assert intervals["overall"]["low"] > 0.95 and intervals["number"]["n"] > 0


def test_cosmetic_edit_keeps_the_words():
    assert cosmetic_edit("a  b\n c") == "a b c."
    assert cosmetic_edit("a b.") == "a b"


# --- spread ------------------------------------------------------------------------------


def test_false_claims_are_repeated_later_and_the_hazard_ratio_is_recovered(step):
    truth = step["truth"]["true_label"]
    times = time_to_first(step["claims"], step["edges"], ["repeats"], 336)
    false = [times[c] for c in times if truth[c] == "contradicted"]
    other = [times[c] for c in times if truth[c] != "contradicted"]
    result = logrank([t for t, _ in false], [e for _, e in false], [t for t, _ in other], [e for _, e in other])
    assert result["p"] < 1e-6 and 0.4 < result["hazard_ratio"] < 0.6  # planted 0.5
    km_false = kaplan_meier([t for t, _ in false], [e for _, e in false])
    assert km_median(km_false) > km_median(kaplan_meier([t for t, _ in other], [e for _, e in other]))
    surv = [p["survival"] for p in km_false]
    assert surv == sorted(surv, reverse=True)


def test_false_claims_are_corrected_more_often(step):
    truth = step["truth"]["true_label"]
    times = time_to_first(step["claims"], step["edges"], ["corrects"], 336)
    share = lambda keep: sum(times[c][1] for c in times if keep(truth[c])) / sum(1 for c in times if keep(truth[c]))  # noqa: E731
    assert share(lambda t: t == "contradicted") > 0.3 > 0.1 > share(lambda t: t != "contradicted")


def test_time_to_first_censors_and_ignores_edges_before_the_claim():
    claims = [{"claim_id": "c1", "ts": "2025-01-10T00:00:00Z"}, {"claim_id": "c2", "ts": "2025-01-10T00:00:00Z"}]
    edges = [
        {"claim_id": "c1", "relation": "repeats", "ts": "2025-01-10T06:00:00Z"},
        {"claim_id": "c1", "relation": "repeats", "ts": "2025-01-10T02:00:00Z"},
        {"claim_id": "c2", "relation": "repeats", "ts": "2025-01-09T00:00:00Z"},
    ]
    assert time_to_first(claims, edges, ["repeats"], 48) == {"c1": (2.0, True), "c2": (48, False)}
    assert math.isnan(logrank([1.0], [False], [2.0], [False])["p"])


# --- forecasts and sandbox ---------------------------------------------------------------


def test_overconfident_forecasts_are_flagged_by_calibration_not_by_auc():
    sharp, honest = mock.mock_forecasts(1500, sharpness=2.0), mock.mock_forecasts(1500, sharpness=1.0)
    assert expected_calibration_error(sharp) > 2 * expected_calibration_error(honest)
    assert auc(sharp) == pytest.approx(auc(honest), abs=1e-9)  # a monotone sharpening leaves the ranking alone
    assert brier_skill_score(honest) > brier_skill_score(sharp)
    low, high = auc_interval(honest, resamples=200)
    assert low < auc(honest) < high
    assert _rank_auc([p.probability for p in honest], [p.outcome for p in honest]) == pytest.approx(auc(honest))
    assert sum(b["n"] for b in reliability_bins(honest)) == 1500


def test_forecast_statistics_on_nothing():
    assert math.isnan(expected_calibration_error([])) and math.isnan(brier_skill_score([]))
    assert all(math.isnan(x) for x in auc_interval([Prediction("a", 0.5, True)]))


def test_the_planted_intervention_effect_is_detected(step):
    runs = {arm: [r for r in step["lab_runs"] if r.arm == arm] for arm in mock.LAB_RATES}
    k = {arm: sum(r.acted_on_claim for r in rs) for arm, rs in runs.items()}
    n = {arm: len(rs) for arm, rs in runs.items()}
    diff = risk_difference(k["planted_claim_with_intervention"], n["planted_claim_with_intervention"], k["planted_claim"], n["planted_claim"])
    assert diff["high"] < 0 and fisher_p(k["planted_claim_with_intervention"], n["planted_claim_with_intervention"], k["planted_claim"], n["planted_claim"]) < 0.05


# --- audit and catalogue -----------------------------------------------------------------


def test_mock_meets_every_minimum_except_the_one_it_cannot_mock(step):
    measured = audit.measure(step["claims"], step["verdicts"], len(step["edges"]), [40, 40, 40], len(step["forecasts"]))
    rows = {r["id"]: r["status"] for r in audit.audit(measured)}
    assert rows.pop("seed_findings") == "pending"
    assert set(rows.values()) == {"enough"}


def test_a_thin_sample_is_reported_short(step):
    claims = step["claims"][:40]
    ids = {c["claim_id"] for c in claims}
    measured = audit.measure(claims, [v for v in step["verdicts"] if v["claim_id"] in ids], 0, [], 0)
    rows = {r["id"]: r["status"] for r in audit.audit(measured)}
    assert rows["months"] == "short" and rows["edges"] == "none" and rows["arm_runs"] == "none" and rows["paired"] == "short"
    assert "T3" in audit.blocked(audit.audit(measured))


def test_catalogue_points_at_real_requirements_and_modules():
    ids = {r.id for r in audit.REQUIREMENTS}
    assert len({s.id for s in CATALOGUE}) == len(CATALOGUE)
    assert all(set(s.needs) <= ids for s in CATALOGUE)
    assert {s.status for s in CATALOGUE} <= {"wired", "built", "here", "scoped"}
    for s in CATALOGUE:
        if s.status == "here":
            assert Path("src", *s.where.split(".")).with_suffix(".py").exists(), s.id


# --- the standard-library maths, against values from scipy and statsmodels ---------------------


def test_distribution_functions_match_reference_values():
    assert chi2_sf(3.841458820694124, 1) == pytest.approx(0.05, abs=1e-12)
    assert chi2_sf(5.991464547107979, 2) == pytest.approx(0.05, abs=1e-12)
    assert chi2_sf(0, 3) == 1.0 and chi2_sf(200, 2) < 1e-40
    assert norm_sf(1.959963984540054) == pytest.approx(0.025, abs=1e-12) and norm_ppf(0.975) == pytest.approx(1.959963984540054)
    assert fisher_two_sided(3, 10, 8, 10) == pytest.approx(0.06977851869492736, abs=1e-12)
    assert binom_two_sided_half(2, 10) == pytest.approx(0.109375) and binom_two_sided_half(0, 0) == 1.0
    assert solve([[2, 1], [1, 3]], [3, 5]) == pytest.approx([0.8, 1.4])
    with pytest.raises(ValueError):
        solve([[1, 2], [2, 4]], [1, 2])


def test_clustered_trend_matches_statsmodels(trend):
    fit = trend_logit(trend["records"])  # statsmodels GLM, cov_type="cluster" on the agent: 1.08016975, p 3.9516e-4
    assert fit["odds_ratio_per_month"] == pytest.approx(1.0801697489709, rel=1e-8)
    assert (fit["low"], fit["high"]) == pytest.approx((1.03506111, 1.12724425), rel=1e-6)
    assert fit["p"] == pytest.approx(3.9516136e-4, rel=1e-5)


def test_logrank_matches_statsmodels_on_a_small_case():
    d1, e1, d2, e2 = [1, 2, 3, 4, 5], [True, True, False, True, False], [2, 3, 6, 7, 8], [True, False, True, True, True]
    result = logrank(d1, e1, d2, e2)
    assert result["chi2"] == pytest.approx(1.5907082608113539, abs=1e-9)  # statsmodels survdiff
    assert result["p"] == pytest.approx(0.20722497229740688, abs=1e-9)
    assert result["hazard_ratio"] > 1  # group 1 had its events sooner


# --- command lines -----------------------------------------------------------------------


def test_mock_writes_files_and_the_audit_reads_them_back(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["mock", "--scenario", "null", "--out", str(tmp_path)])
    mock.main()
    assert {p.name for p in tmp_path.iterdir()} == {"claims.json", "verdicts.json", "edges.json", "lab_runs.json", "forecasts.json", "truth.json"}
    monkeypatch.setattr("sys.argv", ["audit", "--dir", str(tmp_path), "--db", str(tmp_path / "none.sqlite")])
    audit.main()
    out = capsys.readouterr().out
    assert "mock-judge-a" in out and "pending  seed_findings" in out and "R1  waiting on seed_findings" in out


def test_audit_needs_claims_and_verdicts(tmp_path):
    with pytest.raises(SystemExit):
        audit.load(tmp_path, None)


def test_audit_counts_spread_edges_from_the_sample_database(tmp_path, step):
    import sqlite3

    mock.write(step, tmp_path)
    (tmp_path / "edges.json").unlink()
    db = sqlite3.connect(tmp_path / "s.sqlite")
    db.execute("create table spread_edges (x)")
    db.executemany("insert into spread_edges values (?)", [(1,), (2,)])
    db.commit()
    db.close()
    assert audit.load(tmp_path, tmp_path / "s.sqlite")["edges"] == 2
