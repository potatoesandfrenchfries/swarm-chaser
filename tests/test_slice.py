import pytest

from conftest import REPO_ROOT
from ingest.slice import episode_dates, finding_dates, findings_touching, load_slice
from ingest.village import Lookup, load_lookup

FINDINGS = [
    {"id": "A1", "group": "keep", "behavior_dates": "2025-05-02 (Day 30)"},
    {"id": "A2", "group": "rewrite", "behavior_dates": "2025-04-30 to 2025-05-03, then again 2025-05-09"},
    {"id": "A3", "group": "drop", "behavior_dates": "2025-05-02"},  # not a usable group
    {"id": "A4", "group": "keep", "behavior_dates": "2025-05-20"},  # after the episode
    {"id": "A5", "group": "keep", "behavior_dates": "no date given"},
    {"id": "A6", "group": "needs screenshots", "behavior_dates": "2025-05-02"},
]


def test_dates_are_every_yyyy_mm_dd_in_the_free_text_once():
    assert finding_dates(FINDINGS[1]) == ["2025-04-30", "2025-05-03", "2025-05-09"]
    assert finding_dates({"behavior_dates": None}) == [] and finding_dates({}) == []


def test_only_usable_findings_with_a_date_in_the_episode_are_listed_by_id_and_group(lookup):
    assert findings_touching(FINDINGS, lookup, "e1") == [{"id": "A1", "group": "keep"}, {"id": "A2", "group": "rewrite"}]


def test_the_first_and_last_date_of_an_episode_count(lookup):
    edge = [{"id": "S", "group": "keep", "behavior_dates": "2025-05-01"}, {"id": "E", "group": "keep", "behavior_dates": "2025-05-10"}]
    assert [f["id"] for f in findings_touching(edge, lookup, "e1")] == ["S", "E"]


def test_an_ongoing_or_unknown_episode_is_an_error_not_a_silent_empty_list(lookup):
    with pytest.raises(ValueError):
        episode_dates(lookup, "e2")
    with pytest.raises(KeyError):
        episode_dates(lookup, "nope")
    assert isinstance(lookup, Lookup)


def test_the_committed_slice_names_episodes_and_at_least_three_findings_each():
    cfg = load_slice()
    assert cfg["slice"]["episodes"] and set(cfg["findings"]) == set(cfg["slice"]["episodes"])
    assert all(len(ids) >= 3 for ids in cfg["findings"].values())  # MVP minimum data: three documented failures
    assert all(i.startswith("M") for ids in cfg["findings"].values() for i in ids)


REAL = REPO_ROOT / "local" / "hf"


@pytest.mark.skipif(not (REAL / "village_goals.jsonl.gz").exists(), reason="no local copy of the village export")
def test_every_committed_episode_exists_in_the_real_export_and_is_closed():
    lookup = load_lookup(REAL / "agents.jsonl.gz", REAL / "village_goals.jsonl.gz")
    for eid in load_slice()["slice"]["episodes"]:
        episode_dates(lookup, eid)
