"""The sample village database Person 1 hands to Person 2 (MVP M4.5, issue #65).

    PYTHONPATH=src uv run python -m adapters.sample_run publish        # builds local/sample.sqlite

The file is `SAMPLE_DB`, `local/sample.sqlite`. It holds village text (research use only), so like
`local/slice.sqlite` it is git-ignored and shared outside git. `tests/` carries a synthetic copy built by
the same code (tests/test_handoff.py), so nothing here needs the real file to run.

Tables. `rows` is the M2 table unchanged. The rest are what M6, M7 and M8 read:

- `claims`: `extract.claims.Claim`, plus `room`, the room of the chat row the quote came from ("" for a
  memory). `episode_id` is always the episode of the claim's own row.
- `verdicts`: `check.checker.Verdict`, one row per claim per checker vendor (`judge` says which).
- `rooms` / `room_members`: `chat_rooms`, and who may read each room as `{room_id: {agent names}}`. A
  whitelist is the members; a blacklist is everyone else; neither means every agent.
- `room_timeline`: `{agent: [(ts, room_id), ...]}`, the input to `spread.linker.visible_rows`.

`room_timeline` is read off the agents' own chat rows, because the export's `events` table (which holds the
`ENTER_ROOM` events) is not downloaded here. An agent is placed in the room it last spoke in, so a move it
made without speaking afterwards is missed. `source` says which: "start" for the one room that existed
before the second room was created, "chat" for a room an agent was seen speaking in. Filling the table from
`ENTER_ROOM` instead changes the data, not the readers.
"""
import json
import sqlite3
from pathlib import Path

from check.checker import VERDICTS, Verdict
from extract.claims import Claim, render_row
from ingest.store import COLUMNS, connect, read_rows, write_rows
from ingest.village import iter_jsonl, normalise_ts

SAMPLE_DB = Path("local/sample.sqlite")
ROOMS_BEGAN = "2026-02-25T00:00:00.000000Z"  # SCHEMA.md: chat rooms were added on this date

CLAIM_COLUMNS = ("claim_id", "episode_id", "agent", "model", "ts", "source", "quote", "claim_type", "checkable", "extractor", "row_id", "room")


def connect_sample(path: str | Path) -> sqlite3.Connection:
    db = connect(path)
    db.execute(
        "CREATE TABLE IF NOT EXISTS claims (claim_id TEXT PRIMARY KEY, episode_id TEXT NOT NULL, agent TEXT NOT NULL, model TEXT NOT NULL, ts TEXT NOT NULL, "
        "source TEXT NOT NULL, quote TEXT NOT NULL, claim_type TEXT NOT NULL, checkable INTEGER NOT NULL, extractor TEXT NOT NULL, row_id TEXT NOT NULL, room TEXT NOT NULL)"
    )
    verdict_list = ", ".join(f"'{v}'" for v in VERDICTS)
    db.execute(
        f"CREATE TABLE IF NOT EXISTS verdicts (claim_id TEXT NOT NULL, judge TEXT NOT NULL, verdict TEXT NOT NULL CHECK (verdict IN ({verdict_list})), "
        "confidence REAL NOT NULL, evidence TEXT NOT NULL, PRIMARY KEY (claim_id, judge))"
    )
    db.execute("CREATE TABLE IF NOT EXISTS rooms (room_id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS room_members (room_id TEXT NOT NULL, agent TEXT NOT NULL, PRIMARY KEY (room_id, agent))")
    db.execute(
        "CREATE TABLE IF NOT EXISTS room_timeline (agent TEXT NOT NULL, ts TEXT NOT NULL, room_id TEXT NOT NULL, "
        "source TEXT NOT NULL CHECK (source IN ('start', 'chat')), PRIMARY KEY (agent, ts, room_id))"
    )
    return db


def write_claims(db: sqlite3.Connection, claims: list[Claim]) -> dict:
    """Insert claims, taking `episode_id` and `room` from each claim's own row. Returns how many were stored and
    how many had a different episode on the claim than on its row (a chunk built across episodes stamps the first
    one's id on every claim, and the checker builds a claim's evidence from its episode).
    """
    rows = {r[0]: (r[1], r[2]) for r in db.execute("SELECT id, episode_id, room FROM rows")}
    repaired, orphans = 0, 0
    out = []
    for c in claims:
        episode, room = rows.get(c.row_id, (c.episode, ""))
        repaired += episode != c.episode
        orphans += c.row_id not in rows
        out.append((c.claim_id, episode, c.agent, c.model, c.ts, c.source, c.quote, c.claim_type, int(c.checkable), c.extractor, c.row_id, room))
    db.executemany(f"INSERT OR REPLACE INTO claims VALUES ({', '.join('?' * len(CLAIM_COLUMNS))})", out)
    db.commit()
    return {"claims": len(out), "episode_repaired": repaired, "row_missing": orphans}


def write_verdicts(db: sqlite3.Connection, verdicts: list[Verdict]) -> dict:
    """Insert verdicts. A claim judged twice by one vendor keeps its first verdict, as `eval.validation.agreement_report`
    does, and the repeats are counted rather than lost. Only that conflict is skipped: an unknown verdict word still fails.
    """
    before = db.total_changes
    db.executemany(
        "INSERT INTO verdicts VALUES (?, ?, ?, ?, ?) ON CONFLICT (claim_id, judge) DO NOTHING",
        [(v.claim_id, v.judge, v.verdict, v.confidence, json.dumps(v.evidence, ensure_ascii=False)) for v in verdicts],
    )
    db.commit()
    stored = db.total_changes - before
    return {"verdicts": stored, "verdicts_repeated": len(verdicts) - stored}


def read_claims(db: sqlite3.Connection) -> list[Claim]:
    sql = "SELECT claim_id, episode_id, agent, model, ts, source, quote, claim_type, checkable, extractor, row_id FROM claims ORDER BY ts, claim_id"
    return [Claim(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], bool(c[8]), c[9], c[10]) for c in db.execute(sql)]


def read_claim_rooms(db: sqlite3.Connection) -> dict[str, str]:
    """{claim_id: room} ("" for a claim from a memory), for `spread.linker.visible_rows`."""
    return dict(db.execute("SELECT claim_id, room FROM claims"))


def read_verdicts(db: sqlite3.Connection) -> list[Verdict]:
    sql = "SELECT claim_id, verdict, evidence, judge, confidence FROM verdicts ORDER BY claim_id, judge"
    return [Verdict(c, v, json.loads(e), j, conf) for c, v, e, j, conf in db.execute(sql)]


def read_room_timelines(db: sqlite3.Connection) -> dict[str, list[tuple[str, str]]]:
    out: dict[str, list[tuple[str, str]]] = {}
    for agent, ts, room in db.execute("SELECT agent, ts, room_id FROM room_timeline ORDER BY agent, ts, room_id"):
        out.setdefault(agent, []).append((ts, room))
    return out


def read_room_members(db: sqlite3.Connection) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for room, agent in db.execute("SELECT room_id, agent FROM room_members"):
        out.setdefault(room, set()).add(agent)
    return out


def read_record(db: sqlite3.Connection, claim: Claim) -> str | None:
    """The text a claim's quote was checked against, as it was shown to the extractor (header line and row text),
    for `spread.linker.documented_case(..., record=...)`. None if the claim carries no row.
    """
    found = db.execute(f"SELECT {', '.join(COLUMNS)} FROM rows WHERE id = ?", (claim.row_id,)).fetchone() if claim.row_id else None
    return render_row(dict(zip(COLUMNS, found))) if found else None


def _members(room: dict, roster: list[str]) -> list[str]:
    white, black = room.get("whitelisted_agent_names"), room.get("blacklisted_agent_names")
    if white is not None:
        return sorted(set(white))
    return sorted(set(roster) - set(black or []))


def read_room_data(export_dir: Path, end_ts: str) -> dict:
    """Rooms, who may read them, and each agent's room timeline up to `end_ts`, from `chat_rooms`, `agents` and
    `chat_messages` in the export. Also a `report` of what could not be settled.
    """
    export_dir = Path(export_dir)
    agents = {a["id"]: a["name"] for a in iter_jsonl(export_dir / "agents.jsonl.gz")}
    roster = sorted(agents.values())
    rooms = sorted(iter_jsonl(export_dir / "chat_rooms.jsonl.gz"), key=lambda r: normalise_ts(r["created_at"]))
    first, second = rooms[0], rooms[1]
    unknown = sorted({n for r in rooms for n in (r.get("whitelisted_agent_names") or []) + (r.get("blacklisted_agent_names") or []) if n not in roster})

    spoke: dict[str, list[tuple[str, str]]] = {}
    for m in iter_jsonl(export_dir / "chat_messages.jsonl.gz"):
        if m["speaker_type"] != "agent" or m["agent_speaker_id"] not in agents or not m["room_id"]:
            continue
        ts = normalise_ts(m["created_at"])
        if ts <= end_ts:
            spoke.setdefault(agents[m["agent_speaker_id"]], []).append((ts, m["room_id"]))

    cutoff = normalise_ts(second["created_at"])
    timeline: dict[str, list[tuple[str, str, str]]] = {}
    outside_first = 0
    for agent, seen in spoke.items():
        seen.sort()
        entries: list[tuple[str, str, str]] = []
        if seen[0][0] < cutoff:
            entries.append((ROOMS_BEGAN, first["id"], "start"))  # only one room existed, so everyone who spoke then was in it
            outside_first += sum(room != first["id"] for ts, room in seen if ts < cutoff)
        for ts, room in seen:
            if not entries or entries[-1][1] != room:
                entries.append((ts, room, "chat"))
        timeline[agent] = entries
    return {
        "rooms": [(r["id"], r["name"], normalise_ts(r["created_at"]), normalise_ts(r["deleted_at"]) if r.get("deleted_at") else "") for r in rooms],
        "members": {r["id"]: _members(r, roster) for r in rooms},
        "timeline": timeline,
        "report": {
            "rooms": len(rooms),
            "agents_with_a_timeline": len(timeline),
            "chat_before_second_room_outside_first_room": outside_first,
            "room_list_names_not_in_roster": unknown,
        },
    }


def write_room_data(db: sqlite3.Connection, data: dict) -> None:
    db.executemany("INSERT OR REPLACE INTO rooms VALUES (?, ?, ?, ?)", data["rooms"])
    db.executemany("INSERT OR REPLACE INTO room_members VALUES (?, ?)", [(room, a) for room, names in data["members"].items() for a in names])
    db.executemany("INSERT OR REPLACE INTO room_timeline VALUES (?, ?, ?, ?)", [(a, ts, room, src) for a, entries in data["timeline"].items() for ts, room, src in entries])
    db.commit()


def build_sample(slice_db: str | Path, out: str | Path, claims: list[Claim], verdicts: list[Verdict], export_dir: Path) -> dict:
    """Write the sample database at `out` from the slice's rows, the claims and verdicts, and the export's room files.
    Rebuilding from the same inputs gives the same file contents.
    """
    out = Path(out)
    if out.exists():
        out.unlink()
    rows = read_rows(connect(slice_db))
    db = connect_sample(out)
    write_rows(db, rows)
    report = {"rows": len(rows), **write_claims(db, claims), **write_verdicts(db, verdicts)}
    data = read_room_data(export_dir, max(r["ts"] for r in rows))
    write_room_data(db, data)
    report["rooms"] = data["report"]
    db.close()
    return report
