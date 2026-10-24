"""Load one slice of the AI Village export into normalised records (scope.md section 5, M2).

Two record kinds, both reduced to the same shape so `extract/` can chunk them together:
    message_id/memory_id, episode_id, agent, model, ts (ISO 8601), source ("chat" | "memory"), text

CUSTOMISE: the field names below are placeholders. The real Hugging Face tables
(aidigestorg/ai-village: `chat_messages`, `agent_memories`, `agents`, ...) have their own
column names and a `villages`/`episode` id scheme that we have not inspected against a
real download yet (M1 is gated access). Before running this on real data:
  1. Run `temps_ideas/repos/slopvestigatorbench-aivillage/scripts/build_aivillage_data.py`
     (or `swarm-tracer/scripts/fetch_aivillage.py`) to get a local copy and print its schema.
  2. Rewrite `_row_from_message` / `_row_from_memory` to match the real column names.
  3. Re-check `join_by_time`: scope.md section 9 flags "do memories and the timeline join
     cleanly by time?" as unverified. This module's `join_report` exists to answer that in
     the first hour, per MVP.md's "Order of work".
"""
import json
from pathlib import Path

# CUSTOMISE: how close two timestamps must be to count as "the same moment" when checking
# whether memories and the timeline can be joined. Pick this from a first look at real data.
JOIN_TOLERANCE_SECONDS = 60


def _row_from_message(raw: dict) -> dict:
    """One normalised row from a raw chat-message record. CUSTOMISE the key names."""
    return {
        "id": raw["message_id"],
        "episode_id": raw.get("episode_id", raw.get("village_id", "")),
        "agent": raw["agent"],
        "model": raw.get("model", ""),
        "ts": raw["ts"],
        "source": "chat",
        "text": raw.get("text", ""),
    }


def _row_from_memory(raw: dict) -> dict:
    """One normalised row from a raw agent-memory record. CUSTOMISE the key names."""
    return {
        "id": raw["memory_id"],
        "episode_id": raw.get("episode_id", raw.get("village_id", "")),
        "agent": raw["agent"],
        "model": raw.get("model", ""),
        "ts": raw["ts"],
        "source": "memory",
        "text": raw.get("text", ""),
    }


def load_jsonl(path: Path, row_fn) -> list[dict]:
    """Read one JSON-lines file, normalising each row with `row_fn`. Skips blank lines."""
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(row_fn(json.loads(line)))
    return rows


def load_messages(path: Path) -> list[dict]:
    return load_jsonl(path, _row_from_message)


def load_memories(path: Path) -> list[dict]:
    return load_jsonl(path, _row_from_memory)


def _parse_ts(ts: str) -> float:
    """ISO 8601 to a float for comparison. CUSTOMISE if the real export uses epoch seconds."""
    from datetime import datetime

    return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()


def join_report(messages: list[dict], memories: list[dict], tolerance: float = JOIN_TOLERANCE_SECONDS) -> dict:
    """Pass/fail check: for each agent, does every memory land within `tolerance` seconds of
    some chat message by the same agent? Record this result once, by hand, as scope.md's
    "join test" (section 9, question 2) before building anything that depends on the join.
    """
    by_agent = {}
    for m in messages:
        by_agent.setdefault(m["agent"], []).append(_parse_ts(m["ts"]))
    for times in by_agent.values():
        times.sort()

    unmatched = []
    for mem in memories:
        times = by_agent.get(mem["agent"], [])
        ts = _parse_ts(mem["ts"])
        if not any(abs(ts - t) <= tolerance for t in times):
            unmatched.append(mem["id"])

    n = len(memories)
    return {
        "n_memories": n,
        "n_unmatched": len(unmatched),
        "unmatched_ids": unmatched[:20],  # a sample to look at, not the whole list
        "pass": n > 0 and len(unmatched) / n < 0.1,  # CUSTOMISE: pick a real threshold, not 10%
    }


def episode_rows(messages: list[dict], memories: list[dict], episode_id: str) -> list[dict]:
    """All rows for one episode, chat and memory mixed, sorted by time. The unit `extract/`
    chunks over (scope.md's `ingest/` -> `extract/` boundary).
    """
    rows = [r for r in messages + memories if r["episode_id"] == episode_id]
    return sorted(rows, key=lambda r: _parse_ts(r["ts"]))
