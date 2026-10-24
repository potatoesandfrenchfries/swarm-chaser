"""Run an extraction prompt over chunks (MVP M3.4).

    spec = extractor_spec()                          # the [extractor] table in config.toml
    chunks = pick_chunks(chunk_rows(rows), 10)       # a small sample, evenly spread through the slice
    client = ModelClient(spec, transport, mode="live", spend_cap_usd=remaining_usd(DEFAULT_CACHE, [spec, *checkers]))
    claims, dropped = run_extraction(chunks, client.as_caller(), extractor="e1", failed=failed)

`extract_requests` gives the (prompt, text) pairs a run would send, in the shape `ModelClient.estimate` takes,
so the call count and cost are known before a paid run. The model's claims are checked against the chunk by
`parse_claims`, so a quote that is not in one row of the chunk is dropped and counted, never kept.
"""
import tomllib
from pathlib import Path
from typing import Callable, Optional

from extract.claims import PROMPTS, Claim, parse_claims
from llm.client import ModelSpec, ReplyNotJSON

CONFIG = Path(__file__).resolve().parent.parent.parent / "config.toml"
SPEC_KEYS = ("vendor", "model", "temperature", "max_tokens", "usd_per_mtok_in", "usd_per_mtok_out")


def extractor_spec(path: Path = CONFIG) -> ModelSpec:
    """The extraction model named in config.toml's `[extractor]` table."""
    entry = tomllib.loads(Path(path).read_text(encoding="utf-8")).get("extractor")
    if not entry:
        raise ValueError("config.toml has no [extractor] table")
    # No temperature unless the entry sets one: ModelSpec's 0.0 default would be sent and some models reject it.
    return ModelSpec(**{"temperature": None, **{k: v for k, v in entry.items() if k in SPEC_KEYS}})


def pick_chunks(chunks: list[dict], n: int) -> list[dict]:
    """`n` chunks spaced evenly through the list, the same ones every time. All of them if `n` is at least as many."""
    if n < 0:
        raise ValueError(f"n must not be negative, got {n}")
    if n >= len(chunks):
        return list(chunks)
    return [chunks[i * len(chunks) // n] for i in range(n)]


def _prompt(extractor: str) -> str:
    if extractor not in PROMPTS:
        raise ValueError(f"unknown extractor {extractor!r}; known: {sorted(PROMPTS)}")
    return PROMPTS[extractor]


def extract_requests(chunks: list[dict], extractor: str = "e1") -> list[tuple[str, str]]:
    prompt = _prompt(extractor)
    return [(prompt, c["text"]) for c in chunks]


def run_extraction(
    chunks: list[dict], call_extractor: Callable[[str, str], dict], extractor: str = "e1", failed: Optional[list] = None
) -> tuple[list[Claim], list[dict]]:
    """(claims, dropped) over all the chunks. A reply that is not JSON, or whose claims are not a list of
    objects, stops the run, unless `failed` is given: then the chunk's id is appended to it and the run goes
    on, so a long run survives one bad reply and the caller can say how many chunks gave nothing.

    Neighbouring chunks share a row (`chunk_rows` overlap), so the same quote from the same row can come back
    from both. Only the first is kept; the repeat is dropped as `repeat_from_overlap`, or it would count twice.
    """
    prompt = _prompt(extractor)
    claims, dropped, seen = [], [], set()
    for chunk in chunks:
        try:
            reply = call_extractor(prompt, chunk["text"])
            if not isinstance(reply.get("claims", []), list) or not all(isinstance(c, dict) for c in reply.get("claims", [])):
                raise ReplyNotJSON("claims is not a list of objects")
            kept, rejected = parse_claims(reply, chunk, extractor)
        except ReplyNotJSON:
            if failed is None:
                raise
            failed.append(chunk["chunk_id"])
            continue
        dropped.extend(rejected)
        for c in kept:
            if (c.row_id, c.quote) in seen:
                dropped.append({"chunk_id": chunk["chunk_id"], "claim_id": c.claim_id, "reason": "repeat_from_overlap"})
                continue
            seen.add((c.row_id, c.quote))
            claims.append(c)
    return claims, dropped
