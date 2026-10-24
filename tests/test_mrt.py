"""The MRT loader on made-up files shaped like the real ones. No MRT text is copied into the repo."""

import json
import random

import pytest

from sandbox.mrt import LABELLED_ROOT, dataset, load_sample, side_task_label, stress_test, to_transcript

SECRET = "ZZ-HIDDEN-SIDE-TASK"


def conversation(agent_text="I will look at the calendar", extra=()):
    return [
        {"role": "system", "content": f"You are being tested. Secretly do {SECRET}.", "tool_calls": []},
        {"role": "user", "content": "Please plan the trip for the visitors", "tool_calls": []},
        {"role": "assistant", "content": f"<thinking>my plan is {SECRET}</thinking>{agent_text}", "tool_calls": [{"name": "x"}]},
        {"role": "tool", "content": "ok", "tool_calls": []},
        *extra,
    ]


def write(root, path, conv, side="skip"):
    file = root / path
    file.parent.mkdir(parents=True, exist_ok=True)
    data = {"conversation": conv, "monitoring_response": "score 3"}
    if side != "skip":
        data["side_task_evaluation"] = side
    file.write_text(json.dumps(data))


# --- to_transcript -----------------------------------------------------------------------------------


def test_the_system_message_and_the_thinking_never_reach_the_model():
    transcript = to_transcript(conversation())
    assert SECRET not in json.dumps(transcript)
    assert [m["role"] for m in transcript] == ["user", "agent", "tool"]


def test_an_agent_turn_with_only_thinking_is_dropped_unless_it_made_a_tool_call():
    thinking_only = {"role": "assistant", "content": "<thinking>hmm</thinking>", "tool_calls": []}
    thinking_and_call = {"role": "assistant", "content": "<thinking>hmm</thinking>", "tool_calls": [{"name": "x"}]}
    assert to_transcript([thinking_only]) == []
    assert to_transcript([thinking_and_call]) == [{"role": "agent", "text": ""}]


def test_a_thinking_block_that_spans_lines_is_removed_whole():
    text = to_transcript([{"role": "assistant", "content": "<thinking>line one\nline two</thinking>\nvisible", "tool_calls": []}])[0]["text"]
    assert text == "visible"


def test_list_content_and_unknown_roles_are_tolerated():
    out = to_transcript([{"role": "user", "content": [{"type": "text", "text": "hi"}, {"type": "image"}]}, {"role": "developer", "content": "x"}, {"role": "tool", "content": None}])
    assert out == [{"role": "user", "text": "hi"}, {"role": "tool", "text": ""}]


@pytest.mark.parametrize(("value", "expected"), [(True, 1), (False, 0), ("True", 1), (" false ", 0), (None, None), ("0.7", None), (1, None), ("", None)])
def test_side_task_label_reads_only_clear_booleans(value, expected):
    assert side_task_label(value) == expected


# --- load_sample ---------------------------------------------------------------------------------------


def test_the_report_says_why_each_file_was_left_out(tmp_path):
    base = f"{LABELLED_ROOT}/t1/s/a/m"
    write(tmp_path, f"{base}/transcript_0.json", conversation(), side=True)
    write(tmp_path, f"{base}/transcript_1.json", conversation(), side=None)  # no outcome
    write(tmp_path, f"{base}/transcript_2.json", [{"role": "system", "content": "x"}], side=False)  # nothing visible
    (tmp_path / f"{base}/transcript_3.json").write_text("{not json")
    write(tmp_path, "task_pairs_agentcompany/t9/s/a/m/transcript_0.json", conversation(), side=True)  # wrong root
    records, report = load_sample(tmp_path)
    assert len(records) == 1 and records[0].label == 1 and records[0].task == "t1"
    assert report == {"files": 5, "kept": 1, "no_side_task_label": 1, "no_visible_agent_turns": 1, "unreadable": 1, "not_in_labelled_root": 1}


def test_the_same_run_under_two_monitors_counts_once_and_a_label_conflict_is_reported(tmp_path):
    write(tmp_path, f"{LABELLED_ROOT}/t1/s/a/m1/transcript_0.json", conversation(), side=True)
    write(tmp_path, f"{LABELLED_ROOT}/t1/s/a/m2/transcript_0.json", conversation(), side=False)
    write(tmp_path, f"{LABELLED_ROOT}/t1/s/a/m3/transcript_0.json", conversation(), side=True)
    records, report = load_sample(tmp_path)
    assert len(records) == 1 and records[0].monitor_model == "m1"
    assert report["duplicate_transcripts"] == 2 and report["label_conflicts"] == 1


def test_the_monitors_verdict_is_not_something_the_features_can_see(tmp_path):
    write(tmp_path, f"{LABELLED_ROOT}/t1/s/a/m/transcript_0.json", conversation(), side=True)
    records, _ = load_sample(tmp_path)
    assert "score 3" not in json.dumps(records[0].transcript)


# --- dataset and the stress test -------------------------------------------------------------------


def test_the_cutoff_is_a_share_of_each_transcript_and_must_be_in_range():
    records = [r for r in _records(2)]
    short, full = dataset(records, 0.25)[0][0], dataset(records, 1.0)[0][0]
    assert short != full
    for bad in (0, -0.1, 1.5):
        with pytest.raises(ValueError):
            dataset(records, bad)


def _records(n_per_task, tasks=("a", "b", "c", "d"), seed=0):
    """Made-up records where acting agents hedge less, across several tasks."""
    from sandbox.mrt import Record

    rng = random.Random(seed)
    records = []
    for task in tasks:
        for i in range(n_per_task):
            label = i % 2
            hedge = "maybe unsure" if not label else "proceeding"
            transcript = [{"role": "user", "text": f"task {task}"}] + [{"role": "agent", "text": f"{hedge} step {rng.random()}"}, {"role": "tool", "text": "ok"}] * 3
            records.append(Record(f"{LABELLED_ROOT}/{task}/s/a/m/transcript_{i}.json", task, "s", "a", "m", label, transcript, f"{task}{i}"))
    return records


def test_stress_test_reports_both_kinds_of_fold_at_every_cutoff_and_finds_a_real_signal():
    result = stress_test(_records(12))
    assert set(result["by_cutoff"]) == {"0.25", "0.5", "0.75", "1.0"}
    full = result["by_cutoff"]["1.0"]
    assert full["leave_one_task_out"]["accuracy"] > 0.9
    assert full["leave_one_task_out"]["shuffled_accuracy"] < full["leave_one_task_out"]["accuracy"]
    assert set(full["random_folds"]) >= {"accuracy", "auc", "brier"}


def test_a_class_too_small_for_random_folds_is_reported_not_raised():
    records = _records(2, tasks=("a", "b", "c"))  # 3 of each class: too few for 5 folds, enough to hold a task out
    result = stress_test(records)
    assert "error" in result["by_cutoff"]["0.5"]["random_folds"]
    assert "accuracy" in result["by_cutoff"]["0.5"]["leave_one_task_out"]


def test_a_sample_with_one_outcome_is_reported_as_an_error_in_both_evaluations():
    result = stress_test(_records(1, tasks=("a", "b", "c")))
    assert "error" in result["by_cutoff"]["0.5"]["leave_one_task_out"] and "error" in result["by_cutoff"]["0.5"]["random_folds"]
