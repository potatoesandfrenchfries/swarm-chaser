import json
import os
from pathlib import Path

import pytest
from hypothesis import HealthCheck, settings

# Local runs explore randomly; CI is derandomized so a red build reproduces from the same commit
# (MVP.md M13: a rerun from a clean checkout should match).
settings.register_profile("dev", max_examples=100, deadline=None)
settings.register_profile(
    "ci",
    max_examples=300,
    deadline=None,
    derandomize=True,
    suppress_health_check=[HealthCheck.too_slow],
)
settings.load_profile(os.environ.get("HYPOTHESIS_PROFILE", "dev"))

REPO_ROOT = Path(__file__).resolve().parent.parent

# A tiny two-agent village. Agent "alice" reports a build that "passed" and "bob" repeats it; in
# alice's own log the build is shown failing, so the claim is contradicted. "carol" makes a claim
# the record backs up. Field names match ingest/village.py's placeholder schema.
MESSAGES = [
    {"message_id": "m1", "episode_id": "e1", "agent": "alice", "model": "model-x", "ts": "2025-05-01T09:00:00Z", "text": "Starting the nightly build now."},
    {"message_id": "m2", "episode_id": "e1", "agent": "alice", "model": "model-x", "ts": "2025-05-01T10:00:00Z", "text": "The nightly build passed with 12 tests green."},
    {"message_id": "m3", "episode_id": "e1", "agent": "bob", "model": "model-y", "ts": "2025-05-01T11:00:00Z", "text": "Confirming the nightly build passed with 12 tests green."},
    {"message_id": "m4", "episode_id": "e1", "agent": "carol", "model": "model-y", "ts": "2025-05-01T12:00:00Z", "text": "I uploaded 3 reports to the shared drive."},
    {"message_id": "m5", "episode_id": "e1", "agent": "dave", "model": "model-z", "ts": "2025-05-01T13:00:00Z", "text": "That is wrong, the nightly build actually failed."},
    {"message_id": "m6", "episode_id": "e2", "agent": "alice", "model": "model-x", "ts": "2025-06-01T09:00:00Z", "text": "A message from a different episode."},
]
MEMORIES = [
    {"memory_id": "k1", "episode_id": "e1", "agent": "alice", "model": "model-x", "ts": "2025-05-01T10:00:30Z", "text": "Build log: 3 of 12 tests failed on the nightly build."},
    {"memory_id": "k2", "episode_id": "e1", "agent": "carol", "model": "model-y", "ts": "2025-05-01T12:00:20Z", "text": "Uploaded 3 reports to the shared drive at noon."},
]


def write_jsonl(path: Path, records: list[dict], blank_lines: bool = False) -> Path:
    lines = [json.dumps(r) for r in records]
    path.write_text(("\n\n".join(lines) if blank_lines else "\n".join(lines)) + "\n", encoding="utf-8")
    return path


@pytest.fixture
def village(tmp_path):
    """Paths to a synthetic village export: (messages.jsonl, memories.jsonl)."""
    return write_jsonl(tmp_path / "messages.jsonl", MESSAGES), write_jsonl(tmp_path / "memories.jsonl", MEMORIES)
