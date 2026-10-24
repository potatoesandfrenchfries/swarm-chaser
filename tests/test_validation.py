import random
from dataclasses import replace

from check.checker import Verdict
from eval.validation import (
    agreement_report,
    cohen_kappa,
    known_failure_recall,
    perturb,
    perturbation_test,
)
from extract.claims import Claim


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
