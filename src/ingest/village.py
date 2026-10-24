"""Load one slice of the AI Village export into normalised records (scope.md section 5, M2).

Two record kinds, both reduced to the same shape so `extract/` can chunk them together:
    id, episode_id, agent, model, ts (ISO 8601, UTC, "Z"), source ("chat" | "memory"), text, room

Real columns (aidigestorg/ai-village, SCHEMA.md in the dataset):
- `chat_messages`: id, agent_speaker_id (-> agents.id), speaker_type ("agent" | "user"), content,
  room_id, created_at. Human rows (`speaker_type == "user"`) are skipped: they are not agents'
  claims and have no agent or model.
- `agent_memories`: id, agent_id (-> agents.id), content, created_at. The file is about 2.5 GB
  compressed, so loaders stream it and keep only rows inside the requested time window.
- `agents`: id, name (display name, used as `agent`), model_string (used as `model`).
- `village_goals`: id, goal, start_time, end_time (null = ongoing). The export is one village
  with no episode column, so an *episode* here is one village-goal period (51 of them) and
  `episode_id` is the goal's id.

Timestamps in the export look like `2026-02-23 16:56:28.221`: UTC, no zone suffix, a variable
number of fractional digits. They are rewritten to `2026-02-23T16:56:28.221000Z` (fixed six digits)
so every later stage can parse them and plain string order is time order.

The row's `room` is kept for M7's "could have seen" rule (`chat_rooms` has per-room agent
whitelists and blacklists). Memory rows have an empty `room`.
"""
import gzip
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

# How close two timestamps must be to count as "the same moment" when checking whether
# memories and the timeline can be joined (`join_report`). This is a first guess, to be set from
# the real memories-versus-chat gaps by M2.4.
JOIN_TOLERANCE_SECONDS = 60


def normalise_ts(ts: str) -> str:
    """`2026-02-23 16:56:28.221` -> `2026-02-23T16:56:28.221000Z`. A value with a zone is converted to UTC;
    one without is taken to be UTC, which is what the export's SCHEMA.md says.
    """
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    dt = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


@dataclass
class Lookup:
    """What the loaders need from the small tables: who an agent id is, and which episode a time falls in."""

    agents: dict[str, dict]  # agents.id -> {"name", "model"}
    episodes: list[tuple[str, str, str | None]]  # (episode_id, start, end) in normalised ts, sorted by start; end None = ongoing

    def episode_of(self, ts: str) -> str:
        """The episode whose [start, end) contains `ts`, or "" for a time in no goal period."""
        found = ""
        for episode_id, start, end in self.episodes:
            if start <= ts and (end is None or ts < end):
                found = episode_id
        return found


def open_text(path: Path):
    """Open a `.jsonl` or `.jsonl.gz` file as text."""
    path = Path(path)
    return gzip.open(path, "rt", encoding="utf-8") if path.suffix == ".gz" else open(path, encoding="utf-8")


def iter_jsonl(path: Path):
    """Yield one parsed object per non-blank line. A line that is not JSON raises, so a bad export stops the run."""
    with open_text(path) as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def load_lookup(agents_path: Path, goals_path: Path) -> Lookup:
    agents = {a["id"]: {"name": a["name"], "model": a["model_string"]} for a in iter_jsonl(agents_path)}
    episodes = sorted(
        ((g["id"], normalise_ts(g["start_time"]), normalise_ts(g["end_time"]) if g["end_time"] else None) for g in iter_jsonl(goals_path)),
        key=lambda e: e[1],
    )
    return Lookup(agents, episodes)


def _in_window(ts: str, start: str | None, end: str | None) -> bool:
    return (start is None or ts >= start) and (end is None or ts < end)


def _wanted(ts: str, lookup: Lookup, start: str | None, end: str | None, episodes: set[str] | None) -> bool:
    """True if `ts` is inside [start, end) and, when `episodes` is given, inside one of those episodes."""
    return _in_window(ts, start, end) and (episodes is None or lookup.episode_of(ts) in episodes)


def load_jsonl(path: Path, row_fn, keep=lambda ts: True, stats: dict | None = None) -> list[dict]:
    """Normalise each record with `row_fn(raw, stats) -> row or None` (None = skipped, reason counted in
    `stats`), keeping rows whose normalised `ts` passes `keep(ts)`. Rows that fail it are counted as
    `outside_slice`.
    """
    stats = stats if stats is not None else {}
    rows = []
    for raw in iter_jsonl(path):
        row = row_fn(raw, stats)
        if row is None:
            continue
        if not keep(row["ts"]):
            stats["outside_slice"] = stats.get("outside_slice", 0) + 1
            continue
        rows.append(row)
    return rows


def load_messages(
    path: Path, lookup: Lookup, start: str | None = None, end: str | None = None, episodes: set[str] | None = None, stats: dict | None = None
) -> list[dict]:
    """Agent chat rows with `start <= ts < end` and, if `episodes` is given, inside those episodes."""
    def to_row(raw: dict, st: dict) -> dict | None:
        if raw["speaker_type"] != "agent":
            st["human_rows_skipped"] = st.get("human_rows_skipped", 0) + 1
            return None
        text = raw.get("content") or ""
        if not text.strip():
            st["empty_text_skipped"] = st.get("empty_text_skipped", 0) + 1
            return None
        agent = lookup.agents[raw["agent_speaker_id"]]  # an unknown agent is a schema problem, so KeyError stops the run
        ts = normalise_ts(raw["created_at"])
        return {"id": raw["id"], "episode_id": lookup.episode_of(ts), "agent": agent["name"], "model": agent["model"], "ts": ts, "source": "chat", "text": text, "room": raw.get("room_id") or ""}

    return load_jsonl(path, to_row, lambda ts: _wanted(ts, lookup, start, end, episodes), stats)


def load_memories(
    path: Path, lookup: Lookup, start: str | None = None, end: str | None = None, episodes: set[str] | None = None, stats: dict | None = None
) -> list[dict]:
    """Agent memory rows, selected like `load_messages`. The slice test runs first on every row because
    most of the 2.5 GB file is outside it.
    """

    def to_row(raw: dict, st: dict) -> dict | None:
        ts = normalise_ts(raw["created_at"])
        if not _wanted(ts, lookup, start, end, episodes):
            st["outside_slice"] = st.get("outside_slice", 0) + 1
            return None
        text = raw.get("content") or ""
        if not text.strip():
            st["empty_text_skipped"] = st.get("empty_text_skipped", 0) + 1
            return None
        agent = lookup.agents[raw["agent_id"]]
        return {"id": raw["id"], "episode_id": lookup.episode_of(ts), "agent": agent["name"], "model": agent["model"], "ts": ts, "source": "memory", "text": text, "room": ""}

    return load_jsonl(path, to_row, stats=stats)


def _parse_ts(ts: str) -> float:
    """ISO 8601 to epoch seconds. A value with no zone is taken to be UTC, not local time."""
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).timestamp()


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
        "pass": n > 0 and len(unmatched) / n < 0.1,  # CUSTOMISE: M2.4 replaces this 10% with a threshold read off the real data
    }


def episode_rows(messages: list[dict], memories: list[dict], episode_id: str) -> list[dict]:
    """All rows for one episode, chat and memory mixed, sorted by time. The unit `extract/`
    chunks over (scope.md's `ingest/` -> `extract/` boundary).
    """
    rows = [r for r in messages + memories if r["episode_id"] == episode_id]
    return sorted(rows, key=lambda r: _parse_ts(r["ts"]))
