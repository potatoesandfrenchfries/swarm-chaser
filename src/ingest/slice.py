"""Which episodes the pipeline runs on, and which seed findings fall inside them (MVP M2.2).

`slice.toml` names the episodes (village-goal ids). The seed findings come from slopvestigatorbench's
`final-findings.json`, whose entries carry free-text `behavior_dates`; every YYYY-MM-DD in that text is
taken as a date the behaviour happened on. A finding *touches* an episode if any of its dates falls on
or between the episode's start and end dates. Episode boundaries are mid-day, so this is a date-level
match and can count a finding whose behaviour was just outside the episode: read the list, do not treat
it as exact.

Only finding ids and groups are written to the repo. A finding embeds record excerpts, so its text falls
under the dataset terms and stays out of git.
"""
import re
import tomllib
from pathlib import Path

from ingest.village import Lookup

SLICE_CONFIG = Path(__file__).resolve().parent.parent.parent / "slice.toml"
USABLE_GROUPS = ("keep", "rewrite")  # 84 + 12 = the 96 usable findings
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def load_slice(path: Path = SLICE_CONFIG) -> dict:
    return tomllib.loads(Path(path).read_text(encoding="utf-8"))


def episode_dates(lookup: Lookup, episode_id: str) -> tuple[str, str]:
    """(first date, last date) of a closed episode."""
    for eid, start, end in lookup.episodes:
        if eid == episode_id:
            if end is None:
                raise ValueError(f"episode {episode_id} is still running; the slice needs closed episodes")
            return start[:10], end[:10]
    raise KeyError(episode_id)


def finding_dates(finding: dict) -> list[str]:
    return sorted(set(DATE.findall(finding.get("behavior_dates") or "")))


def findings_touching(findings: list[dict], lookup: Lookup, episode_id: str) -> list[dict]:
    """Usable findings with any date in the episode, as `{"id", "group"}` only."""
    first, last = episode_dates(lookup, episode_id)
    return [
        {"id": f["id"], "group": f["group"]}
        for f in findings
        if f["group"] in USABLE_GROUPS and any(first <= d <= last for d in finding_dates(f))
    ]
