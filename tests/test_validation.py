import json
import random
from dataclasses import replace
from pathlib import Path

import pytest

from check.checker import Verdict
from eval.validation import (
    SEED_FINDINGS_PATH,
    agreement_report,
    cohen_kappa,
    finding_date_range,
    kappa_interval,
    known_failure_recall,
    load_seed_findings,
    locate_findings,
    perturb,
    perturbation_test,
    slice_finding_ids,
    tag_false_claim_findings,
    validation_table,
)
from extract.claims import Claim
from report.page import section_4_validation


def claim(quote):
    return Claim(claim_id="c1", episode="e1", agent="a", model="", ts="2025-05-01T00:00:00Z", source="chat", quote=quote, claim_type="x", checkable=True)


def test_perturb_changes_a_number():
    rng = random.Random(0)
    out = perturb("the count was 42 visitors", rng)
    assert out != "the count was 42 visitors"
    assert "42" not in out


def test_perturb_returns_none_when_nothing_to_change():
    rng = random.Random(0)
    assert perturb("no numbers or years here", rng) is None


def test_perturb_never_makes_a_count_negative():
    assert all(not perturb("passed 1 test", random.Random(s)).startswith("passed -") for s in range(50))


def test_perturb_swaps_a_month_for_another_month():
    out = perturb("shipped in May as planned", random.Random(0))
    assert out != "shipped in May as planned"
    assert out.split()[2] in {"January", "February", "March", "April", "June", "July", "August", "September", "October", "November", "December"}


def test_perturb_leaves_the_verb_may_alone():
    assert perturb("we may ship soon", random.Random(0)) is None


def test_perturb_swaps_an_agent_name_for_another_agent():
    out = perturb("bob confirmed the upload", random.Random(0), names=("alice", "bob", "carol"))
    assert out.split()[0] in {"alice", "carol"}


def test_perturb_needs_a_second_name_to_swap_to():
    assert perturb("bob confirmed the upload", random.Random(0), names=("bob",)) is None


def test_perturbation_test_swaps_names_across_the_claims_agents():
    claims = [replace(claim("bob confirmed the upload"), agent="alice"), replace(claim("no change here"), agent="bob")]
    seen = []
    result = perturbation_test(claims, lambda c: seen.append(c.quote) or "contradicted")
    assert result["n_perturbable"] == 1
    assert seen == ["alice confirmed the upload"]


def test_perturbation_test_reports_share_caught():
    claims = [claim("the count was 42 visitors"), claim("no numbers here")]

    def run_checker(c):
        # Pretend the checker always catches a perturbed number.
        return "contradicted" if "42" not in c.quote else "supported"

    result = perturbation_test(claims, run_checker, seed=0)
    assert result["n_perturbable"] == 1  # the second claim has nothing to perturb
    assert result["share_caught"] == 1.0


def test_cohen_kappa_perfect_agreement():
    assert cohen_kappa(["a", "b", "a"], ["a", "b", "a"]) == 1.0


def test_cohen_kappa_empty_is_none():
    assert cohen_kappa([], []) is None


def test_agreement_report_pairs_by_claim_id():
    a = [Verdict("c1", "supported", [], "j1", 0.9), Verdict("c2", "contradicted", [], "j1", 0.9)]
    b = [Verdict("c1", "supported", [], "j2", 0.8), Verdict("c2", "supported", [], "j2", 0.8)]
    report = agreement_report(a, b)
    assert report["n_paired"] == 2
    assert report["agreement"] == 0.5


def test_agreement_report_counts_claims_only_one_vendor_judged():
    a = [Verdict("c1", "supported", [], "j1", 0.9), Verdict("c2", "supported", [], "j1", 0.9), Verdict("c3", "supported", [], "j1", 0.9)]
    b = [Verdict("c1", "supported", [], "j2", 0.8), Verdict("c9", "supported", [], "j2", 0.8)]
    report = agreement_report(a, b)
    assert (report["n_paired"], report["n_only_a"], report["n_only_b"]) == (1, 2, 1)
    assert report["judges"] == ("j1", "j2")


def test_known_failure_recall():
    findings = [{"id": "f1"}, {"id": "f2"}, {"id": "f3"}]
    recall = known_failure_recall(findings, located_finding_ids={"f1", "f3", "f9"})
    assert recall["n_seed_findings"] == 3
    assert recall["n_located"] == 2
    assert recall["recall"] == 2 / 3


# Shaped like slopvestigatorbench's final-findings.json entries, with invented content.
FINDINGS = [
    {"id": "M001", "group": "keep", "headline": "Opus 5 overstated visitors", "finding": "f", "behavior_dates": "2025-05-01 (Day 9), 09:00-10:00 UTC", "subfindings": [{"claim": "s"}]},
    {"id": "M002", "group": "rewrite", "headline": "Gemini never sent the email", "finding": "f", "behavior_dates": "2025-05-02 to 2025-05-04 (not the 2025-06-01 launch)", "subfindings": []},
    {"id": "M003", "group": "drop", "headline": "dropped", "finding": "f", "behavior_dates": "2025-05-01", "subfindings": []},
]


def test_load_seed_findings_keeps_only_usable_groups(tmp_path):
    path = tmp_path / "final-findings.json"
    path.write_text(json.dumps(FINDINGS), encoding="utf-8")
    assert [f["id"] for f in load_seed_findings(path)] == ["M001", "M002"]


def test_tag_false_claim_findings_keeps_false_claims_and_sets_aside_bad_replies():
    replies = {"Opus": {"false_claim": True, "agents": ["Opus 5", 7, ""]}, "Gemini": "yes"}
    tagged, untagged = tag_false_claim_findings(FINDINGS[:2], lambda p, text: replies["Opus" if "Opus" in text else "Gemini"])
    assert [(f["id"], f["agents"]) for f in tagged] == [("M001", ["Opus 5"])]
    assert [f["id"] for f in untagged] == ["M002"]


def test_tag_false_claim_findings_drops_findings_tagged_not_false():
    tagged, untagged = tag_false_claim_findings(FINDINGS[:1], lambda p, t: {"false_claim": False})
    assert tagged == [] and untagged == []


def test_finding_date_range_ignores_dates_in_brackets():
    assert finding_date_range("2025-05-02 to 2025-05-04 (not the 2025-06-01 launch)") == ("2025-05-02", "2025-05-04")
    assert finding_date_range("2026-07-24 (Day 479), 22:55–23:40 UTC") == ("2026-07-24", "2026-07-24")
    assert finding_date_range("sometime in spring") is None


def test_locate_findings_needs_the_named_agent_on_a_day_in_range():
    findings = [{**FINDINGS[0], "agents": ["Opus 5"]}, {**FINDINGS[1], "agents": ["Gemini 2.5 Pro"]}]
    base = claim("q")
    claims = [
        replace(base, agent="Claude Opus 5", ts="2025-05-01T23:30:00Z"),  # M001: right agent, right day
        replace(base, agent="Gemini 2.5 Pro", ts="2025-05-05T00:00:00Z"),  # M002: right agent, day after the range
    ]
    assert locate_findings(findings, claims) == {"M001"}


def test_locate_findings_does_not_match_a_longer_model_name():
    findings = [{**FINDINGS[0], "agents": ["Opus 5"]}]
    assert locate_findings(findings, [replace(claim("q"), agent="Claude Opus 5.5", ts="2025-05-01T09:00:00Z")]) == set()


def test_locate_findings_compares_days_in_utc():
    findings = [{**FINDINGS[0], "agents": ["Opus 5"]}]
    # 2025-05-02 00:30 at +01:00 is still 2025-05-01 in UTC, the zone the findings use.
    assert locate_findings(findings, [replace(claim("q"), agent="Claude Opus 5", ts="2025-05-02T00:30:00+01:00")]) == {"M001"}


_REAL_FINDINGS = Path(__file__).resolve().parent.parent / SEED_FINDINGS_PATH


@pytest.mark.skipif(not _REAL_FINDINGS.exists(), reason=f"real seed findings not cloned to {SEED_FINDINGS_PATH} (gitignored, dataset terms)")
def test_real_seed_findings_load_and_every_date_parses():
    findings = load_seed_findings(_REAL_FINDINGS)
    assert len(findings) == 96  # 84 keep + 12 rewrite, per scope.md
    assert len({f["id"] for f in findings}) == 96
    assert [f["id"] for f in findings if finding_date_range(f["behavior_dates"]) is None] == []


def test_validation_table_has_one_row_per_check_with_its_sample_size():
    rows = validation_table(
        {"n_perturbable": 300, "n_caught": 240, "share_caught": 0.8},
        {"n_paired": 500, "agreement": 0.9, "kappa": 0.72, "unreliable": False},
        {"n_seed_findings": 30, "n_located": 12, "recall": 0.4},
        {"n_read": 20, "note": "two verdicts cited the wrong day"},
    )
    assert [(r["value"], r["n"]) for r in rows] == [("0.80 (0.75-0.84)", 300), ("0.72", 500), ("0.40 (0.25-0.58)", 30), ("two verdicts cited the wrong day", 20)]
    assert all(r["note"] for r in rows)


def test_validation_table_shows_missing_numbers_and_flags_low_kappa():
    empty_perturbation = perturbation_test([], lambda c: "supported")
    empty_recall = known_failure_recall([], set())
    spot_check = {"n_read": 0, "note": "not done yet"}

    rows = validation_table(empty_perturbation, {"n_paired": 0, "agreement": float("nan"), "kappa": None, "unreliable": False}, empty_recall, spot_check)
    assert [r["value"] for r in rows[:3]] == ["n/a", "n/a", "n/a"]

    low = validation_table(empty_perturbation, {"n_paired": 10, "agreement": 0.5, "kappa": 0.1, "unreliable": True}, empty_recall, spot_check)
    assert "unreliable" in low[1]["note"]


def test_section_4_shows_the_validation_table_with_n_and_limits():
    rows = validation_table(
        {"n_perturbable": 300, "n_caught": 240, "share_caught": 0.8},
        {"n_paired": 500, "agreement": 0.9, "kappa": 0.72, "unreliable": False},
        {"n_seed_findings": 30, "n_located": 12, "recall": 0.4},
        {"n_read": 20, "note": "two verdicts cited the <wrong> day"},
    )
    out = section_4_validation({}, table=rows)
    assert out.count("<tr>") == 5 and "What it does not show" in out
    assert "&lt;wrong&gt;" in out and "<wrong>" not in out


def test_known_failure_recall_counts_only_findings_the_slice_could_contain():
    findings = [{"id": "M001"}, {"id": "M002"}, {"id": "M003"}, {"id": "M999"}]
    r = known_failure_recall(findings, {"M001", "M999"}, in_slice={"M001", "M002", "M003"})
    assert (r["n_seed_findings"], r["n_located"], r["n_outside_slice"]) == (3, 1, 1)  # M999 is outside, found or not
    assert r["low"] < 1 / 3 < r["high"]


def test_slice_finding_ids_reads_every_episode_in_slice_toml():
    config = {"findings": {"ep1": ["M001", "M002"], "ep2": ["M002", "M003"]}}
    assert slice_finding_ids(config) == {"M001", "M002", "M003"}
    assert slice_finding_ids()  # slice.toml lists the findings inside the chosen episodes


def test_agreement_report_counts_a_claim_judged_twice_once_and_reports_the_duplicate():
    a = [Verdict("c1", "supported", [], "j1", 0.9), Verdict("c1", "contradicted", [], "j1", 0.9), Verdict("c2", "supported", [], "j1", 0.9)]
    b = [Verdict("c1", "supported", [], "j2", 0.8), Verdict("c2", "contradicted", [], "j2", 0.8), Verdict("c2", "supported", [], "j2", 0.8)]
    report = agreement_report(a, b)
    assert (report["n_paired"], report["n_only_a"], report["n_only_b"]) == (2, 0, 0)  # c1 not paired twice
    assert (report["n_duplicate_a"], report["n_duplicate_b"]) == (1, 1)
    assert report["agreement"] == 0.5  # first verdicts: c1 agrees, c2 does not


def test_perturbation_test_splits_the_caught_share_by_kind_of_change():
    claims = [claim("the count was 42 visitors"), claim("shipped in May"), replace(claim("bob confirmed it"), agent="bob"), replace(claim("no change"), agent="alice")]
    # A checker that only notices changed numbers.
    by_kind = {}
    result = perturbation_test(claims, lambda c: "contradicted" if "42" not in c.quote and c.quote.startswith("the count") else "supported", by_kind=by_kind)
    assert by_kind == {"number": {"n": 1, "n_caught": 1}, "date": {"n": 1, "n_caught": 0}, "name": {"n": 1, "n_caught": 0}}
    assert (result["n_perturbable"], result["n_caught"]) == (3, 1)

    no_agreement = {"n_paired": 0, "agreement": float("nan"), "kappa": None, "unreliable": False}
    row = validation_table(result, no_agreement, known_failure_recall([], set()), {"n_read": 0, "note": ""}, perturbation_by_kind=by_kind)[0]
    assert row["note"].endswith("; caught: numbers 1/1, dates 0/1, names 0/1")


def test_kappa_interval_brackets_kappa_and_is_the_same_every_run():
    a = ["supported"] * 30 + ["contradicted"] * 20 + ["unverifiable"] * 10
    b = ["supported"] * 25 + ["contradicted"] * 5 + ["contradicted"] * 18 + ["supported"] * 2 + ["unverifiable"] * 10
    low, high = kappa_interval(a, b)
    assert low < cohen_kappa(a, b) < high
    assert kappa_interval(a, b) == (low, high)
    assert kappa_interval([], []) == (None, None)
    assert kappa_interval(["supported", "contradicted"] * 10, ["supported", "contradicted"] * 10) == (1.0, 1.0)


def test_validation_table_shows_kappa_with_its_interval():
    a = [Verdict(f"c{i}", v, [], "j1", 0.9) for i, v in enumerate(["supported", "contradicted"] * 20)]
    b = [Verdict(f"c{i}", v, [], "j2", 0.9) for i, v in enumerate(["supported", "contradicted"] * 19 + ["contradicted", "contradicted"])]
    report = agreement_report(a, b)
    row = validation_table(perturbation_test([], lambda c: "supported"), report, known_failure_recall([], set()), {"n_read": 0, "note": ""})[1]
    assert row["value"] == f"{report['kappa']:.2f} ({report['kappa_low']:.2f}-{report['kappa_high']:.2f})"
    assert report["kappa_low"] < report["kappa"] <= report["kappa_high"]
