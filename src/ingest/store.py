"""Write the chosen slice to one SQLite table and read it back (MVP M2.3).

    PYTHONPATH=src uv run python -m ingest.store local/hf local/slice.sqlite

builds `local/slice.sqlite` from the export files in `local/hf/` (`agents`, `village_goals`,
`chat_messages`, and `agent_memories` if it is there) for the episodes named in `slice.toml`. The
database holds text from the village export, whose terms are research use only, so it lives under the
git-ignored `local/` and is never committed (tests/test_repo_hygiene.py fails if a .sqlite is tracked).

The table is `rows(id, episode_id, agent, model, ts, source, text, room)`, the same shape the loaders
return, so `read_rows` feeds `extract/` unchanged. Nothing in it depends on when it was built: rebuilding
from the same export gives the same rows in the same order.
"""
import sqlite3
import sys
from pathlib import Path

from ingest.slice import load_slice
from ingest.village import load_lookup, load_memories, load_messages

COLUMNS = ("id", "episode_id", "agent", "model", "ts", "source", "text", "room")


def connect(db_path: str | Path) -> sqlite3.Connection:
    if str(db_path) != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(db_path))
    db.execute(
        "CREATE TABLE IF NOT EXISTS rows (id TEXT PRIMARY KEY, episode_id TEXT NOT NULL, agent TEXT NOT NULL, model TEXT NOT NULL, "
        "ts TEXT NOT NULL, source TEXT NOT NULL CHECK (source IN ('chat', 'memory')), text TEXT NOT NULL, room TEXT NOT NULL)"
    )
    db.execute("CREATE INDEX IF NOT EXISTS rows_episode_ts ON rows (episode_id, ts)")
    db.execute("CREATE INDEX IF NOT EXISTS rows_agent_ts ON rows (agent, ts)")
    return db


def write_rows(db: sqlite3.Connection, rows: list[dict]) -> int:
    """Insert rows, replacing any with the same id, so rebuilding a slice is idempotent."""
    db.executemany(f"INSERT OR REPLACE INTO rows VALUES ({', '.join('?' * len(COLUMNS))})", [tuple(r[c] for c in COLUMNS) for r in rows])
    db.commit()
    return len(rows)


def read_rows(db: sqlite3.Connection, episode_id: str | None = None, agent: str | None = None) -> list[dict]:
    """Rows in time order (ties broken by id), optionally for one episode and/or one agent."""
    where, args = [], []
    if episode_id is not None:
        where.append("episode_id = ?")
        args.append(episode_id)
    if agent is not None:
        where.append("agent = ?")
        args.append(agent)
    sql = f"SELECT {', '.join(COLUMNS)} FROM rows" + (f" WHERE {' AND '.join(where)}" if where else "") + " ORDER BY ts, id"
    return [dict(zip(COLUMNS, r)) for r in db.execute(sql, args)]


def build_slice(export_dir: Path, db_path: str | Path, episodes: list[str] | None = None) -> dict:
    """Load the slice from the export files into `db_path`. Returns the counts, including what was skipped and why."""
    export_dir = Path(export_dir)
    episodes = set(episodes if episodes is not None else load_slice()["slice"]["episodes"])
    lookup = load_lookup(export_dir / "agents.jsonl.gz", export_dir / "village_goals.jsonl.gz")
    unknown = episodes - {e[0] for e in lookup.episodes}
    if unknown:
        raise KeyError(f"episodes not in village_goals: {sorted(unknown)}")

    db = connect(db_path)
    report = {"chat": {}, "memory": {}}
    messages = load_messages(export_dir / "chat_messages.jsonl.gz", lookup, episodes=episodes, stats=report["chat"])
    report["chat"]["rows"] = write_rows(db, messages)
    memories_path = export_dir / "agent_memories.jsonl.gz"
    if memories_path.exists():
        memories = load_memories(memories_path, lookup, episodes=episodes, stats=report["memory"])
        report["memory"]["rows"] = write_rows(db, memories)
    else:
        report["memory"]["rows"] = None  # not downloaded yet; rerun once agent_memories.jsonl.gz is in place
    db.close()
    return report


if __name__ == "__main__":
    print(build_slice(Path(sys.argv[1]), sys.argv[2]))
