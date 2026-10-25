"""A small paid sample for M3.4 and M4.4: extract claims from a few chunks, then check them with both vendors.

    PYTHONPATH=src uv run python -m adapters.sample_run extract --chunks 10          # dry run: calls and cost, spends nothing
    PYTHONPATH=src uv run python -m adapters.sample_run extract --chunks 10 --live
    PYTHONPATH=src uv run python -m adapters.sample_run check                        # dry run
    PYTHONPATH=src uv run python -m adapters.sample_run check --live
    PYTHONPATH=src uv run python -m adapters.sample_run publish                      # builds local/sample.sqlite for Person 2 (issue #65)

Without `--live` nothing is sent and no key is read. With it, each model is given only what is left of the
`[spend]` budget in config.toml once the shared cache is totalled (src/llm/budget.py), and a run that the
estimate says would not fit is refused before any call. Results go to git-ignored `local/sample_run/` so they
can be read by hand (pipeline-rules: read about 20 outputs before scaling). Kept outside `src/` because it
reaches the network through `adapters/vendors.py`.
"""
import argparse
import json
import sys
from dataclasses import asdict, replace
from pathlib import Path
from typing import Callable

from check.checker import Verdict
from check.run import checker_requests, checker_specs, run_checks
from extract.claims import PROMPTS, Claim, chunk_rows
from extract.run import extract_requests, extractor_spec, pick_chunks, run_extraction
from ingest.handoff import SAMPLE_DB, build_sample
from ingest.store import connect, read_rows
from llm.budget import CONFIG, remaining_usd, total_cap_usd
from llm.client import DEFAULT_CACHE, ModelClient, ModelSpec
from report.headline import headline, verdict_records

EXTRACT_OUT_TOKENS = 6000  # per call, thinking included: Haiku 5.5 averaged 5.3k output tokens in the first sample
CHECK_OUT_TOKENS = 6000  # thinking is counted as output by both checkers; a first guess until a check run is measured
Transports = Callable[[str], Callable]  # vendor name -> transport, as adapters.vendors.make_transport


def _all_specs() -> list[ModelSpec]:
    """Every model that may have answers in the cache, so the spend so far can be priced."""
    return [extractor_spec(), *checker_specs().values()]


def _client(spec: ModelSpec, args, transports: Transports) -> ModelClient:
    live = args.live
    return ModelClient(
        spec,
        transports(spec.vendor) if live else None,
        cache_path=args.cache,
        mode="live" if live else "offline",
        spend_cap_usd=remaining_usd(args.cache, _all_specs(), args.config),
    )


def _estimate(label: str, client: ModelClient, requests: list, out_tokens: int):
    e = client.estimate(requests, expected_out_tokens=out_tokens)
    print(f"{label}: {e.n_requests} requests, {e.n_cached} cached, {e.n_live} to send; ~{e.tokens_in:,} tokens in, ~{e.tokens_out:,} out; est ${e.cost_usd:.4f}")
    return e


def _fits(total: float, remaining: float) -> bool:
    """The budget is shared by every stage and model, so the test is on the total, not on each line."""
    print(f"total est ${total:.4f} of ${remaining:.4f} left -> {'fits' if total <= remaining else 'DOES NOT FIT'}")
    return total <= remaining


def _save(out: Path, name: str, data) -> None:
    out.mkdir(parents=True, exist_ok=True)
    (out / name).write_text(json.dumps(data, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")


def episode_chunks(rows: list[dict]) -> list[dict]:
    """Chunks built one episode at a time. `chunk_rows` takes the episode id from the first row, so given two
    episodes at once it stamps the first one's id on every chunk, and every claim, of the second.
    """
    by_episode: dict[str, list[dict]] = {}
    for row in rows:
        by_episode.setdefault(row["episode_id"], []).append(row)
    return [chunk for episode_rows in by_episode.values() for chunk in chunk_rows(episode_rows)]


def with_row_episodes(claims: list[Claim], rows: list[dict]) -> list[Claim]:
    """Claims whose episode is that of their own row. A claims.json written before chunks were built per
    episode has the first episode's id on claims from the second, and the checker reads a claim's episode to
    build its evidence window.
    """
    episode_of = {r["id"]: r["episode_id"] for r in rows}
    return [replace(c, episode=episode_of.get(c.row_id, c.episode)) for c in claims]


def extract_stage(args, transports: Transports) -> int:
    rows = read_rows(connect(args.db))
    chunks = pick_chunks(episode_chunks(rows), args.chunks)
    spec = extractor_spec()
    print(f"{len(rows)} rows, {len(chunks)} chunks picked; extractor {spec.label}; budget ${total_cap_usd(args.config):.2f} in all")
    client = _client(spec, args, transports)
    total = sum(_estimate(f"extract {name}", client, extract_requests(chunks, name), EXTRACT_OUT_TOKENS).cost_usd for name in PROMPTS)
    fits = _fits(total, client.spend_cap_usd - client.spent_usd)
    if not args.live:
        print("dry run: nothing sent. Add --live to run it.")
        return 0
    if not fits:
        print("refused: the estimate does not fit in what is left of the budget", file=sys.stderr)
        return 1
    claims, dropped, failed = [], [], {}
    for name in PROMPTS:
        bad: list = []
        kept, rejected = run_extraction(chunks, client.as_caller(), name, failed=bad)
        claims += kept
        dropped += rejected
        failed[name] = bad
        print(f"extract {name}: {len(kept)} claims kept, {len(rejected)} dropped, {len(bad)} chunks with no usable reply")
    _save(args.out, "claims.json", [asdict(c) for c in claims])
    _save(args.out, "dropped.json", {"dropped": dropped, "failed_chunks": failed})
    print(f"spent ${client.spent_usd:.4f} this run; wrote {len(claims)} claims to {args.out / 'claims.json'}")
    return 0


def check_stage(args, transports: Transports) -> int:
    path = args.out / "claims.json"
    if not path.exists():
        print(f"no {path}; run the extract stage first", file=sys.stderr)
        return 2
    claims = [Claim(**c) for c in json.loads(path.read_text(encoding="utf-8"))]
    rows = read_rows(connect(args.db))
    claims = with_row_episodes(claims, rows)
    if args.limit is not None:
        claims = pick_chunks(claims, args.limit)  # spread through the file, so a few claims come from every chunk and both prompts
    specs = checker_specs()
    print(f"{len(claims)} claims to check with {', '.join(s.label for s in specs.values())}")
    requests = checker_requests(claims, rows)
    clients = {name: _client(spec, args, transports) for name, spec in specs.items()}
    total = sum(_estimate(f"check {name} ({spec.label})", clients[name], requests, CHECK_OUT_TOKENS).cost_usd for name, spec in specs.items())
    fits = _fits(total, min(c.spend_cap_usd for c in clients.values()))
    for c in clients.values():
        c.close()
    if not args.live:
        print("dry run: nothing sent. Add --live to run it.")
        return 0
    if not fits:
        print("refused: the estimate does not fit in what is left of the budget", file=sys.stderr)
        return 1
    verdicts: list[Verdict] = []
    status: dict = {}
    for name, spec in specs.items():
        client = _client(spec, args, transports)  # asked again, so this one sees what the previous checker spent
        got: list[Verdict] = []
        bad: list = []
        try:
            for claim in claims:  # one at a time, so the verdicts already made survive a failure part-way through
                got += run_checks([claim], rows, client.as_caller(), judge_name=spec.label, failed=bad)
            status[spec.label] = {"claims_judged": len(got), "no_usable_reply": len(bad), "error": None}
        except Exception as problem:  # a rate limit or an oversize request would repeat for every claim, so stop this checker
            status[spec.label] = {"claims_judged": len(got), "no_usable_reply": len(bad), "error": f"{type(problem).__name__}: {str(problem)[:300]}"}
            print(f"check {name} ({spec.label}) STOPPED after {len(got)} of {len(claims)} claims: {status[spec.label]['error']}", file=sys.stderr)
        verdicts += got
        counts = {v: sum(x.verdict == v for x in got) for v in ("supported", "contradicted", "unverifiable")}
        print(f"check {name} ({spec.label}): {counts}, {len(bad)} claims with no usable reply; spent ${client.spent_usd:.4f}")
        client.close()
    quotes = {c.claim_id: c.quote for c in claims}
    _save(args.out, "verdicts.json", [{**asdict(v), "quote": quotes[v.claim_id]} for v in verdicts])
    _save(args.out, "check_status.json", {"claims": len(claims), "checkers": status})
    by_claim: dict = {}
    for v in verdicts:
        by_claim.setdefault(v.claim_id, {})[v.judge] = v.verdict
    both = [pair for pair in by_claim.values() if len(pair) == len(specs)]
    agree = sum(len(set(pair.values())) == 1 for pair in both)
    print(f"{len(both)} claims judged by both; they agree on {agree}")
    return 0 if all(x["error"] is None for x in status.values()) else 1


def publish_stage(args, transports: Transports) -> int:
    """Put the slice's rows, the sample's claims and verdicts, and the room data in one database for Person 2."""
    path = args.out / "claims.json"
    if not path.exists():
        print(f"no {path}; run the extract stage first", file=sys.stderr)
        return 2
    claims = [Claim(**c) for c in json.loads(path.read_text(encoding="utf-8"))]
    # verdicts.json is the check stage's output; verdicts_manual.json, if present, is verdicts a person or model wrote
    # by hand where a vendor's answers are missing, under their own judge name so they are never mistaken for a vendor's.
    verdict_path = args.out / "verdicts.json"
    files = [verdict_path, args.out / "verdicts_manual.json"]
    verdicts = [Verdict(**{k: v for k, v in raw.items() if k != "quote"}) for f in files if f.exists() for raw in json.loads(f.read_text(encoding="utf-8"))]
    report = build_sample(args.db, args.sample_db, claims, verdicts, args.export)
    print(json.dumps(report, indent=1, sort_keys=True))
    if not verdicts:
        print(f"warning: no {verdict_path}; the verdicts table is empty until the check stage has run", file=sys.stderr)
    print(f"wrote {args.sample_db}")
    return 0


def _plain(value):
    """JSON-safe: tuple keys become "a|b" strings and NaN (an empty group's interval) becomes null."""
    if isinstance(value, dict):
        return {("|".join(map(str, k)) if isinstance(k, tuple) else k): _plain(v) for k, v in value.items()}
    if isinstance(value, float) and value != value:
        return None
    return value


def headline_stage(args, transports: Transports) -> int:
    """Shares of supported, contradicted and unverifiable (M5.2) over the sample's verdicts, with Wilson intervals.
    Only the live vendors' verdicts count unless `--include-manual`: a hand-written verdict covers claims a vendor
    also judged, so counting both would count a claim twice."""
    claims_path, verdicts_path = args.out / "claims.json", args.out / "verdicts.json"
    if not (claims_path.exists() and verdicts_path.exists()):
        print(f"need {claims_path} and {verdicts_path}; run the extract and check stages first", file=sys.stderr)
        return 2
    claims = json.loads(claims_path.read_text(encoding="utf-8"))
    verdicts = json.loads(verdicts_path.read_text(encoding="utf-8"))
    vendors = {spec.label for spec in checker_specs().values()}
    manual = args.out / "verdicts_manual.json"
    if args.include_manual and manual.exists():
        verdicts += json.loads(manual.read_text(encoding="utf-8"))
    judges = None if args.include_manual else vendors
    records, report = verdict_records(claims, verdicts, judges)
    if not records:
        print("no verdicts from a live checker to count", file=sys.stderr)
        return 1
    result = headline(records)
    result["sample"] = {**report, "records": len(records), "claims": len({r["claim_id"] for r in records}), "judges": sorted({r["judge"] for r in records}), "includes_manual": args.include_manual}
    _save(args.out, "headline.json", _plain(result))
    overall = result["overall"]
    print(f"{overall['n']} verdicts on {result['sample']['claims']} claims from {', '.join(result['sample']['judges'])}")
    for v in ("supported", "contradicted", "unverifiable"):
        s = overall[v]
        print(f"  {v:<13} {s['k']:>3}/{overall['n']}  {s['p']:.0%}  (95% interval {s['low']:.0%} to {s['high']:.0%})")
    for label, groups in (("by model", result["by_model"]), ("by month", result["by_month"])):
        print(f"{label}: " + ", ".join(f"{name} n={group['n']}" for name, group in groups.items()))
    if overall["n"] < 30:
        print(f"note: n={overall['n']} is small; the intervals are wide and the groups above hold a handful each")
    print(f"wrote {args.out / 'headline.json'}")
    return 0


def main(argv: list[str] | None = None, transports: Transports | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("stage", choices=["extract", "check", "publish", "headline"])
    parser.add_argument("--chunks", type=int, default=10)
    parser.add_argument("--limit", type=int, default=None, help="check only N claims, spread evenly through the file")
    parser.add_argument("--include-manual", action="store_true", help="headline: also count hand-written verdicts (verdicts_manual.json)")
    parser.add_argument("--live", action="store_true", help="send requests and spend money; without it, estimate only")
    parser.add_argument("--db", type=Path, default=Path("local/slice.sqlite"))
    parser.add_argument("--out", type=Path, default=Path("local/sample_run"))
    parser.add_argument("--export", type=Path, default=Path("local/hf"), help="publish: the village export, for chat_rooms and chat_messages")
    parser.add_argument("--sample-db", type=Path, default=SAMPLE_DB, help="publish: where to write the database")
    parser.add_argument("--cache", default=DEFAULT_CACHE)
    parser.add_argument("--config", type=Path, default=CONFIG)
    args = parser.parse_args(argv)
    if transports is None:
        from adapters.vendors import make_transport

        transports = make_transport
    return {"extract": extract_stage, "check": check_stage, "publish": publish_stage, "headline": headline_stage}[args.stage](args, transports)


if __name__ == "__main__":
    raise SystemExit(main())
