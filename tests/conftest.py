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

# A tiny village in the real export's column names (aidigestorg/ai-village: agents, village_goals,
# chat_messages, agent_memories). Agent "alice" reports a build that "passed" and "bob" repeats it; in
# alice's own log the build is shown failing, so the claim is contradicted. "carol" makes a claim the
# record backs up. Goal periods "e1" and "e2" are the episodes: `episode_id` is the goal's id.
AGENTS = [
    {"id": "ag-alice", "name": "alice", "model_string": "model-x"},
    {"id": "ag-bob", "name": "bob", "model_string": "model-y"},
    {"id": "ag-carol", "name": "carol", "model_string": "model-y"},
    {"id": "ag-dave", "name": "dave", "model_string": "model-z"},
]
GOALS = [
    {"id": "e1", "goal": "Ship the nightly build", "start_time": "2025-05-01 00:00:00", "end_time": "2025-05-10 00:00:00"},
    {"id": "e2", "goal": "A later goal", "start_time": "2025-06-01 00:00:00", "end_time": None},
]


def chat(id, agent, ts, content, speaker_type="agent", room="room1"):
    return {"id": id, "agent_speaker_id": f"ag-{agent}" if agent else None, "user_speaker_id": None, "speaker_type": speaker_type,
            "content": content, "room_id": room, "has_been_approved": None, "created_at": ts, "updated_at": ts}


def memory(id, agent, ts, content):
    return {"id": id, "agent_id": f"ag-{agent}", "content": content, "created_at": ts, "updated_at": ts}


MESSAGES = [
    chat("m1", "alice", "2025-05-01 09:00:00.000000", "Starting the nightly build now."),
    chat("m2", "alice", "2025-05-01 10:00:00.000000", "The nightly build passed with 12 tests green."),
    chat("m3", "bob", "2025-05-01 11:00:00.000000", "Confirming the nightly build passed with 12 tests green."),
    chat("m4", "carol", "2025-05-01 12:00:00.000000", "I uploaded 3 reports to the shared drive."),
    chat("m5", "dave", "2025-05-01 13:00:00.000000", "That is wrong, the nightly build actually failed."),
    chat("m6", "alice", "2025-06-01 09:00:00.000000", "A message from a different episode."),
]
MEMORIES = [
    memory("k1", "alice", "2025-05-01 10:00:30.000000", "Build log: 3 of 12 tests failed on the nightly build."),
    memory("k2", "carol", "2025-05-01 12:00:20.000000", "Uploaded 3 reports to the shared drive at noon."),
]


def write_jsonl(path: Path, records: list[dict], blank_lines: bool = False) -> Path:
    lines = [json.dumps(r) for r in records]
    path.write_text(("\n\n".join(lines) if blank_lines else "\n".join(lines)) + "\n", encoding="utf-8")
    return path


@pytest.fixture
def village(tmp_path):
    """Paths to a synthetic village export: (chat_messages.jsonl, agent_memories.jsonl)."""
    return write_jsonl(tmp_path / "chat_messages.jsonl", MESSAGES), write_jsonl(tmp_path / "agent_memories.jsonl", MEMORIES)


@pytest.fixture
def lookup(tmp_path):
    """The agents and goal periods of the synthetic village, as `ingest.village.Lookup`."""
    from ingest.village import load_lookup

    return load_lookup(write_jsonl(tmp_path / "agents.jsonl", AGENTS), write_jsonl(tmp_path / "village_goals.jsonl", GOALS))
