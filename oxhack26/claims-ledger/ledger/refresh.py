"""Fetch every source, keep the sentences that make a claim, and diff against last time.

For each page in data/sources.json:
  1. fetch it and cut out the sentences that match the claim rules
  2. save a dated snapshot, but only when the sentences changed
  3. log what appeared or disappeared since the last snapshot to history.jsonl
  4. keep the most specific sentences as candidates for verify.py

No model is involved. A page that cannot be fetched, or comes back nearly empty
(a block page, a login wall), is logged and skipped. It never counts as "the
claims were removed".
"""
import hashlib
import json
import re
from datetime import datetime, timezone

from .fetch import fetch
from .paths import Paths
from .text import page_text, sentences


def _compile(pattern: str) -> re.Pattern:
    return re.compile(pattern, re.I)


def classify(sentence: str, claim_types: list[dict]) -> tuple[str, str, int | None]:
    """(claim type, basis, target year). The first claim_types rule that matches wins."""
    low = sentence.lower()
    kind = next((t["name"] for t in claim_types if re.search(t["pattern"], low, re.I)), "other")
    if re.search(r"24/7|every hour|around the clock|hour[- ]by[- ]hour", low):
        basis = "hourly"
    elif re.search(r"\bmatch|annual|in 20\d\d", low):
        basis = "annual"
    else:
        basis = "unspecified"
    target = re.search(r"\bby (20[3-9]\d)\b|\bin (20[3-9]\d)\b", low)
    year = int(next(g for g in target.groups() if g)) if target else None
    return kind, basis, year


def snapshot(paths: Paths, key: str, sents: list[str], now: str) -> tuple[list[str], list[str]]:
    """Save this run's sentences if they changed. Returns (added, removed) since the last snapshot."""
    folder = paths.snapshots / key
    folder.mkdir(parents=True, exist_ok=True)
    previous = sorted(folder.glob("*.json"))
    last = json.loads(previous[-1].read_text()) if previous else None
    digest = hashlib.sha256("\n".join(sents).encode()).hexdigest()[:12]

    if last is None or last["digest"] != digest:
        (folder / f"{now.replace(':', '')}.json").write_text(
            json.dumps({"retrieved": now, "digest": digest, "sentences": sents}, indent=1)
        )
    if last is None:
        return [], []  # the first run has nothing to compare with
    old = set(last["sentences"])
    new = set(sents)
    return [s for s in sents if s not in old], [s for s in last["sentences"] if s not in new]


def refresh(paths: Paths, now: str | None = None) -> list[str]:
    now = now or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    config = json.loads(paths.sources.read_text())
    rules = config["rules"]
    claim, speaker = _compile(rules["claim"]), _compile(rules["speaker"])
    exclude = _compile(rules["exclude"]) if rules.get("exclude") else None
    keep = rules.get("keep_per_page", 6)
    min_chars = rules.get("min_page_chars", 500)

    paths.out.mkdir(parents=True, exist_ok=True)
    log: list[str] = []
    candidates: list[dict] = []
    events: list[str] = []

    for source in config["pages"]:
        key = hashlib.sha1(source["url"].encode()).hexdigest()[:10]
        try:
            text = page_text(fetch(source["url"], paths.root))
        except Exception as error:  # network, DNS, 4xx/5xx, missing file
            log.append(f"FAILED  {source['owner']:<18} {source['url']}: {error}")
            continue
        if len(text.strip()) < min_chars:
            log.append(f"SKIPPED {source['owner']:<18} page is nearly empty ({len(text.strip())} chars): blocked or moved?")
            continue

        found = [
            s for s in sentences(text)
            if claim.search(s) and speaker.search(s) and not (exclude and exclude.search(s))
        ]
        added, removed = snapshot(paths, key, found, now)
        for change, items in (("appeared", added), ("disappeared", removed)):
            for s in items:
                events.append(json.dumps({"at": now, "owner": source["owner"], "url": source["url"], "change": change, "text": s}))

        # The most specific sentences first: more claim words, and a number.
        ranked = sorted(found, key=lambda s: len(claim.findall(s)) + 2 * bool(re.search(r"\d", s)), reverse=True)[:keep]
        for s in ranked:
            kind, basis, year = classify(s, config["claim_types"])
            candidates.append({
                "owner": source["owner"], "url": source["url"], "source_kind": source.get("kind", "page"),
                "text": s, "claim_type": kind, "basis": basis, "target_year": year,
            })
        log.append(f"ok      {source['owner']:<18} {len(found):>3} claim sentences, kept {len(ranked)}, +{len(added)} -{len(removed)}")

    if events:
        with paths.history.open("a", encoding="utf-8") as f:
            f.write("\n".join(events) + "\n")
    paths.candidates_auto.write_text(json.dumps(candidates, indent=1))
    return log
