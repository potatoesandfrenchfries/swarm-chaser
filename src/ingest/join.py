"""The memories-and-timeline join test (MVP M2.4), run on the slice in `local/slice.sqlite`.

    PYTHONPATH=src uv run python -m ingest.join local/slice.sqlite join-test.json

Memories and chat share one table and one clock, so the checker's evidence window (the same agent's chat
and memory rows within a day either side of a claim) mixes them. The join "works" if that mix is real:
(a) a memory has same-agent chat close enough to read it against, (b) a chat claim has a same-agent memory
to be checked against, and (c) the two are on the same clock, with no fixed offset between them.

`ingest.village.join_report` asks something stricter: that every memory lands within 60 s of a chat message
by the same agent. A memory is written when the agent consolidates, not when it speaks, so on the real
slice nearly half miss by that rule (reported below as `strict_60s`) even though the clocks agree. That
number is kept as a reference, not as the verdict. The verdict is on (a) and (b) at the window the checker
uses, in each episode, and on (c) as a median gap that is well inside that window.

The result is counts and ids only: no export text, so `join-test.json` can be committed. Nothing in it
depends on when it was run.
"""
import json
import sqlite3
import sys
from bisect import bisect_left, bisect_right
from pathlib import Path

from ingest.store import read_rows
from ingest.village import join_report, parse_ts

# Must equal check.checker.WINDOW_BEFORE_SECONDS and WINDOW_AFTER_SECONDS; tests/test_join.py checks that
# it does. It is repeated here because ingest does not import from the stages after it.
JOIN_WINDOW_SECONDS = 24 * 3600

# An episode passes if at least this share of its memories have same-agent chat inside the window, and of
# its chat rows have a same-agent memory inside it. The same 90% `join_report` already used for its own bar.
MIN_COVERAGE = 0.9

# The clock check passes if the median distance from a memory to the nearest same-agent chat row is at
# most this many seconds: a fixed offset of hours (a timezone slip) would put the median far above it.
MAX_MEDIAN_GAP_SECONDS = 3600

STRICT_TOLERANCE_SECONDS = 60  # `join_report`'s bar, reported for reference


def _quantile(sorted_values: list[float], p: float) -> float:
    return sorted_values[min(len(sorted_values) - 1, int(p * len(sorted_values)))]


def _share(k: int, n: int) -> float | None:
    return round(k / n, 4) if n else None


def _inside(times: list[float], t: float, window: float) -> bool:
    """Whether the sorted `times` has a value in [t - window, t + window]."""
    return bisect_left(times, t - window) < bisect_right(times, t + window)


def join_evidence(rows: list[dict], window: float = JOIN_WINDOW_SECONDS) -> dict:
    """The join test over chat and memory `rows` (the shape `ingest.store.read_rows` returns)."""
    chat = [r for r in rows if r["source"] == "chat"]
    memories = [r for r in rows if r["source"] == "memory"]
    episodes = {}
    for episode_id in sorted({r["episode_id"] for r in rows}):
        episode_chat = [r for r in chat if r["episode_id"] == episode_id]
        episode_memories = [r for r in memories if r["episode_id"] == episode_id]
        chat_times, memory_times = {}, {}
        for r in episode_chat:
            chat_times.setdefault(r["agent"], []).append(parse_ts(r["ts"]))
        for r in episode_memories:
            memory_times.setdefault(r["agent"], []).append(parse_ts(r["ts"]))
        for times in (*chat_times.values(), *memory_times.values()):
            times.sort()

        gaps, memories_with_chat, unmatched = [], 0, []
        for r in episode_memories:
            t, times = parse_ts(r["ts"]), chat_times.get(r["agent"], [])
            if times:
                i = bisect_left(times, t)
                gaps.append(min(abs(times[j] - t) for j in (i - 1, i) if 0 <= j < len(times)))
            if _inside(times, t, window):
                memories_with_chat += 1
            else:
                unmatched.append(r["id"])
        chat_with_memory = sum(_inside(memory_times.get(r["agent"], []), parse_ts(r["ts"]), window) for r in episode_chat)
        gaps.sort()
        strict = join_report(episode_chat, episode_memories, STRICT_TOLERANCE_SECONDS)

        memory_share = _share(memories_with_chat, len(episode_memories))
        chat_share = _share(chat_with_memory, len(episode_chat))
        median_gap = round(_quantile(gaps, 0.5)) if gaps else None
        episodes[episode_id] = {
            "chat_rows": len(episode_chat),
            "memory_rows": len(episode_memories),
            "memories_with_chat_in_window": memories_with_chat,
            "memories_with_chat_in_window_share": memory_share,
            "chat_with_memory_in_window": chat_with_memory,
            "chat_with_memory_in_window_share": chat_share,
            "gap_to_nearest_chat_seconds": {f"p{int(p * 100)}": round(_quantile(gaps, p)) for p in (0.5, 0.75, 0.9, 0.99)} if gaps else {},
            "memories_outside_window_sample": unmatched[:10],
            "strict_60s": {"unmatched": strict["n_unmatched"], "unmatched_share": _share(strict["n_unmatched"], len(episode_memories)), "pass": strict["pass"]},
            "pass": (
                memory_share is not None
                and chat_share is not None
                and memory_share >= MIN_COVERAGE
                and chat_share >= MIN_COVERAGE
                and median_gap is not None
                and median_gap <= MAX_MEDIAN_GAP_SECONDS
            ),
        }
    return {
        "window_seconds": window,
        "min_coverage": MIN_COVERAGE,
        "max_median_gap_seconds": MAX_MEDIAN_GAP_SECONDS,
        "strict_tolerance_seconds": STRICT_TOLERANCE_SECONDS,
        "episodes": episodes,
        "pass": bool(episodes) and all(e["pass"] for e in episodes.values()),
    }


def main(db_path: str, out_path: str) -> dict:
    db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)  # `connect` would create an empty database at a wrong path
    result = join_evidence(read_rows(db))
    db.close()
    Path(out_path).write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


if __name__ == "__main__":
    print(json.dumps(main(sys.argv[1], sys.argv[2]), indent=2, sort_keys=True))
