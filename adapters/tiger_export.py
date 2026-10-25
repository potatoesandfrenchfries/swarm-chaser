"""Copy the sample database into Tiger Data (TimescaleDB) for time-series queries (MLH Tiger Data track).

    uv sync --extra tiger
    PYTHONPATH=src uv run python -m adapters.tiger_export local/sample.sqlite            # no village text
    PYTHONPATH=src uv run python -m adapters.tiger_export local/sample.sqlite --include-text

The connection string is read from `TIGER_DATABASE_URL` (environment or `.env`), never from a file in git.

SQLite stays the working store. This is a one-way, idempotent copy into the `claim_spread` schema:

- `messages` and `spread_edges` are hypertables on `ts`. `claims`, `verdicts` and `rooms` are plain tables.
- `spread_per_day` is a continuous aggregate of `spread_edges`: edges per day, linker and relation.

The village text is research use only (see `ingest/handoff.py`), so without `--include-text` the columns
`messages.text`, `claims.quote` and `verdicts.evidence` are loaded empty. Everything the time-series
queries need (who, when, which claim, which verdict) is still there.
"""

import argparse
import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path

from ingest.handoff import SAMPLE_DB

SCHEMA = "claim_spread"

DDL = f"""
CREATE SCHEMA IF NOT EXISTS {SCHEMA};
CREATE TABLE IF NOT EXISTS {SCHEMA}.messages (
    id TEXT NOT NULL, episode_id TEXT NOT NULL, agent TEXT NOT NULL, model TEXT NOT NULL, ts TIMESTAMPTZ NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('chat', 'memory')), text TEXT NOT NULL, room TEXT NOT NULL,
    PRIMARY KEY (id, ts));
CREATE TABLE IF NOT EXISTS {SCHEMA}.claims (
    claim_id TEXT PRIMARY KEY, episode_id TEXT NOT NULL, agent TEXT NOT NULL, model TEXT NOT NULL, ts TIMESTAMPTZ NOT NULL,
    source TEXT NOT NULL, quote TEXT NOT NULL, claim_type TEXT NOT NULL, checkable BOOLEAN NOT NULL, extractor TEXT NOT NULL,
    row_id TEXT NOT NULL, room TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS {SCHEMA}.verdicts (
    claim_id TEXT NOT NULL, judge TEXT NOT NULL, verdict TEXT NOT NULL, confidence DOUBLE PRECISION NOT NULL, evidence TEXT NOT NULL,
    PRIMARY KEY (claim_id, judge));
CREATE TABLE IF NOT EXISTS {SCHEMA}.rooms (room_id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, deleted_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS {SCHEMA}.spread_edges (
    claim_id TEXT NOT NULL, later_message_id TEXT NOT NULL, relation TEXT NOT NULL, agent TEXT NOT NULL, ts TIMESTAMPTZ NOT NULL, linker TEXT NOT NULL,
    PRIMARY KEY (claim_id, later_message_id, linker, ts));
SELECT create_hypertable('{SCHEMA}.messages', 'ts', if_not_exists => TRUE);
SELECT create_hypertable('{SCHEMA}.spread_edges', 'ts', if_not_exists => TRUE);
"""

# A continuous aggregate cannot be created inside a transaction, so this runs on an autocommit connection.
CAGG = f"""
CREATE MATERIALIZED VIEW IF NOT EXISTS {SCHEMA}.spread_per_day WITH (timescaledb.continuous) AS
SELECT time_bucket('1 day', ts) AS day, linker, relation, count(*) AS edges
FROM {SCHEMA}.spread_edges GROUP BY 1, 2, 3 WITH NO DATA;
"""


def parse_ts(ts: str) -> datetime | None:
    return datetime.fromisoformat(ts.replace("Z", "+00:00")) if ts else None


def _select(db: sqlite3.Connection, sql: str) -> list[tuple]:
    return db.execute(sql).fetchall()


def export(sqlite_path: str | Path, url: str, include_text: bool = False) -> dict:
    """Copy the sample database at `sqlite_path` into the Tiger Data database at `url`. Returns rows copied per table."""
    import psycopg  # optional dependency (`uv sync --extra tiger`)

    db = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    text = (lambda s: s) if include_text else (lambda s: "")
    tables = {
        "messages": ("id, episode_id, agent, model, ts, source, text, room", lambda r: (*r[:4], parse_ts(r[4]), r[5], text(r[6]), r[7])),
        "claims": (
            "claim_id, episode_id, agent, model, ts, source, quote, claim_type, checkable, extractor, row_id, room",
            lambda r: (*r[:4], parse_ts(r[4]), r[5], text(r[6]), r[7], bool(r[8]), *r[9:]),
        ),
        "verdicts": ("claim_id, judge, verdict, confidence, evidence", lambda r: (*r[:4], text(r[4]))),
        "rooms": ("room_id, name, created_at, deleted_at", lambda r: (r[0], r[1], parse_ts(r[2]), parse_ts(r[3]))),
        "spread_edges": ("claim_id, later_message_id, relation, agent, ts, linker", lambda r: (*r[:4], parse_ts(r[4]), r[5])),
    }
    sqlite_table = {"messages": "rows"}
    counts = {}
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(DDL)
        conn.execute(CAGG)
        for name, (columns, convert) in tables.items():
            rows = [convert(r) for r in _select(db, f"SELECT {columns} FROM {sqlite_table.get(name, name)}")]
            if rows:
                with conn.transaction(), conn.cursor() as cur:
                    cur.executemany(f"INSERT INTO {SCHEMA}.{name} ({columns}) VALUES ({', '.join(['%s'] * len(rows[0]))}) ON CONFLICT DO NOTHING", rows)
            counts[name] = len(rows)
        conn.execute(f"CALL refresh_continuous_aggregate('{SCHEMA}.spread_per_day', NULL, NULL)")
    db.close()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("db", nargs="?", type=Path, default=SAMPLE_DB, help="the sample database (default: local/sample.sqlite)")
    parser.add_argument("--include-text", action="store_true", help="also load message text, claim quotes and verdict evidence (research use only)")
    args = parser.parse_args()
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass
    url = os.environ.get("TIGER_DATABASE_URL")
    if not url:
        raise SystemExit("Set TIGER_DATABASE_URL (see .env.example).")
    print(json.dumps(export(args.db, url, args.include_text), indent=2))


if __name__ == "__main__":
    main()
