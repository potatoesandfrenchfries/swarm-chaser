"""The paid-sample driver, against a tiny database and fake transports. No key is read and nothing leaves the machine."""

import json
import sqlite3
import sys
from pathlib import Path

import pytest

from extract.claims import Claim
from ingest.store import COLUMNS, connect, write_rows
from llm.client import Completion

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from adapters import sample_run  # noqa: E402

ROWS = [
    {"id": "r1", "episode_id": "ep", "agent": "a", "model": "m", "ts": "2025-05-01T10:00:00Z", "source": "chat", "text": "I filed the report", "room": "main"},
    {"id": "r2", "episode_id": "ep", "agent": "a", "model": "m", "ts": "2025-05-01T11:00:00Z", "source": "chat", "text": "I filed it earlier", "room": "main"},
]
EXTRACTED = '{"claims": [{"quote": "I filed the report", "agent": "a", "claim_type": "self-report", "checkable": true}]}'
VERDICT = '{"verdict": "supported", "evidence": ["I filed it earlier"], "confidence": 0.9, "reason": "r2 says so"}'


@pytest.fixture
def env(tmp_path):
    db = tmp_path / "slice.sqlite"
    con = connect(db)
    write_rows(con, [{c: r[c] for c in COLUMNS} for r in ROWS])
    con.close()
    budget = tmp_path / "budget.toml"
    budget.write_text("[spend]\ncap_gbp = 3.0\nusd_per_gbp = 1.25\n")
    calls = []

    def transports(vendor):
        def call(spec, system, user):
            calls.append((vendor, "extract" if "claims" in system and "verdict" not in system else "check"))
            return Completion(VERDICT if "verdict" in system else EXTRACTED, 100, 50)

        return call

    def run(*argv, **kw):
        args = [*argv, "--db", str(db), "--out", str(tmp_path / "out"), "--cache", str(tmp_path / "llm.sqlite"), "--config", str(kw.get("config", budget))]
        return sample_run.main(args, transports)

    return type("Env", (), {"run": staticmethod(run), "calls": calls, "out": tmp_path / "out", "tmp": tmp_path})


def test_a_dry_run_sends_nothing_and_says_so(env, capsys):
    assert env.run("extract", "--chunks", "1") == 0
    text = capsys.readouterr().out
    assert "dry run: nothing sent" in text and "fits" in text
    assert env.calls == [] and not (env.out / "claims.json").exists()


def test_a_live_extraction_writes_the_claims_for_both_prompts_and_a_rerun_is_free(env, capsys):
    assert env.run("extract", "--chunks", "1", "--live") == 0
    claims = json.loads((env.out / "claims.json").read_text())
    assert sorted(c["extractor"] for c in claims) == ["e1", "e2"] and all(c["row_id"] == "r1" for c in claims)
    assert len(env.calls) == 2
    capsys.readouterr()
    env.run("extract", "--chunks", "1")  # dry run again: both answers are cached now
    assert "0 to send" in capsys.readouterr().out and len(env.calls) == 2


def test_a_run_that_would_not_fit_the_budget_is_refused_before_any_call(env, capsys):
    tiny = env.tmp / "tiny.toml"
    tiny.write_text("[spend]\ncap_gbp = 0.000001\nusd_per_gbp = 1.0\n")
    assert env.run("extract", "--chunks", "1", "--live", config=tiny) == 1
    assert "DOES NOT FIT" in capsys.readouterr().out and env.calls == []


def test_checking_before_extracting_is_an_error_not_a_crash(env, capsys):
    assert env.run("check") == 2
    assert "extract stage first" in capsys.readouterr().err


def test_both_checkers_judge_every_claim_and_the_verdicts_keep_the_quote(env, capsys):
    env.run("extract", "--chunks", "1", "--live")
    capsys.readouterr()
    assert env.run("check", "--live") == 0
    verdicts = json.loads((env.out / "verdicts.json").read_text())
    assert {v["judge"] for v in verdicts} == {"anthropic/claude-haiku-5-5", "gemini/gemini-3.8-flash"}
    assert len(verdicts) == 4 and all(v["quote"] == "I filed the report" and v["verdict"] == "supported" for v in verdicts)
    out = capsys.readouterr().out
    assert "2 claims judged by both; they agree on 2" in out
    assert {vendor for vendor, kind in env.calls if kind == "check"} == {"anthropic", "gemini"}


def test_limit_checks_only_the_first_claims(env, capsys):
    env.run("extract", "--chunks", "1", "--live")
    capsys.readouterr()
    env.run("check", "--limit", "1")
    assert "1 claims to check" in capsys.readouterr().out


def test_chunks_are_built_one_episode_at_a_time_so_each_keeps_its_own_episode_id():
    rows = [{**ROWS[0], "id": "a1", "episode_id": "ep1"}, {**ROWS[1], "id": "b1", "episode_id": "ep2", "ts": "2025-06-01T10:00:00Z"}]
    chunks = sample_run.episode_chunks(rows)
    assert [(c["episode_id"], c["row_ids"]) for c in chunks] == [("ep1", ["a1"]), ("ep2", ["b1"])]
    assert [c["chunk_id"] for c in chunks] == ["ep1#0", "ep2#0"]


def test_publish_builds_the_sample_database_and_warns_when_no_verdicts_exist(env, capsys):
    from test_handoff import write_export  # the synthetic village's export files, with chat_rooms

    env.run("extract", "--chunks", "1", "--live")
    db = env.tmp / "sample.sqlite"
    export = write_export(env.tmp / "hf")
    capsys.readouterr()
    assert env.run("publish", "--export", str(export), "--sample-db", str(db)) == 0
    captured = capsys.readouterr()
    assert "verdicts table is empty" in captured.err and db.exists()
    con = sqlite3.connect(db)
    assert con.execute("SELECT COUNT(*) FROM claims").fetchone() == (2,) and con.execute("SELECT COUNT(*) FROM verdicts").fetchone() == (0,)


def test_publish_without_extracted_claims_says_to_run_extract_first(env, capsys):
    assert env.run("publish") == 2
    assert "run the extract stage first" in capsys.readouterr().err


def test_a_claim_stamped_with_the_wrong_episode_is_checked_in_its_rows_episode(env):
    rows = [{**ROWS[0], "episode_id": "ep2"}]
    c = Claim("ep1#0-e1-0", "ep1", "a", "m", "t", "chat", "q", "self-report", True, "e1", "r1")
    orphan = Claim("ep1#0-e1-1", "ep1", "a", "m", "t", "chat", "q", "self-report", True, "e1", "")
    assert [x.episode for x in sample_run.with_row_episodes([c, orphan], rows)] == ["ep2", "ep1"]
