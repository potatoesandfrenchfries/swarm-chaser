import math

from lab.arms import LabRun, acting_rate, handling_result, validate_run


def run(arm, acted=False, strategy=None, hacking=0, model="m1"):
    return LabRun(model=model, arm=arm, hacking=hacking, reported=False, influencer_strategy=strategy, run_dir="d", acted_on_claim=acted)


def test_validate_run_flags_unknown_arm():
    problems = validate_run(run(arm="not_a_real_arm"))
    assert any("unknown arm" in p for p in problems)


def test_validate_run_flags_out_of_range_hacking():
    problems = validate_run(run(arm="no_plant", hacking=9))
    assert any("out of 0-5 range" in p for p in problems)


def test_validate_run_flags_missing_strategy_on_intervention_arm():
    problems = validate_run(run(arm="planted_claim_with_intervention", strategy=None))
    assert any("influencer_strategy" in p for p in problems)


def test_acting_rate_counts_within_one_arm():
    runs = [run("planted_claim", acted=True), run("planted_claim", acted=False), run("no_plant", acted=True)]
    result = acting_rate(runs, "planted_claim")
    assert result["n"] == 2
    assert result["k"] == 1
    assert result["rate"] == 0.5


def test_handling_result_compares_with_and_without_intervention():
    runs = [
        run("planted_claim", acted=True),
        run("planted_claim", acted=True),
        run("planted_claim_with_intervention", acted=False, strategy="direct"),
        run("planted_claim_with_intervention", acted=False, strategy="direct"),
    ]
    result = handling_result(runs)
    assert result["without_intervention"]["rate"] == 1.0
    assert result["with_intervention"]["direct"]["rate"] == 0.0
    assert result["with_intervention"]["direct"]["difference_from_no_intervention"] == -1.0


def test_handling_result_is_nan_with_no_runs():
    result = handling_result([])
    assert math.isnan(result["without_intervention"]["rate"])
