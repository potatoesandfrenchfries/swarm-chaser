"""Link a claim to later repeats, endorsements and corrections (scope.md section 5, M7).

Two linkers, scored against each other: `baseline_link` (plain n-gram overlap, no model) and
an LLM-based linker you plug in via `call_relation_classifier`. M7 explicitly asks for the
model-based linker to beat the baseline, not just exist, so keep both runnable on the same
input.

CUSTOMISE: this only covers claims in chat. The idea of matching one agent's words appearing
later in another agent's input is from `temps_ideas/repos/crosstalk` (concept only, no
licence) — written here from scratch as an n-gram match, not copied code.
"""
import re
from dataclasses import dataclass
from typing import Callable, Optional

from ingest.village import _parse_ts

RELATIONS = ("repeats", "endorses", "corrects", "disputes")

# CUSTOMISE: how much word overlap counts as "repeats this claim" for the baseline. Tune
# against a hand-checked sample (M7's "hand-check a sample of linked edges; report precision").
NGRAM_SIZE = 4
MIN_SHARED_NGRAMS = 2


def _ngrams(text: str, n: int = NGRAM_SIZE) -> set[tuple[str, ...]]:
    words = re.findall(r"\w+", text.lower())
    return {tuple(words[i : i + n]) for i in range(max(0, len(words) - n + 1))}


@dataclass
class SpreadEdge:
    """One row of the `Spread edge` record shape in scope.md section 5."""

    claim_id: str
    later_message_id: str
    relation: str
    agent: str
    ts: str


def could_have_seen(claim_agent: str, claim_ts: str, later_row: dict, channel_members: Optional[set] = None) -> bool:
    """A repeat/correction only counts if the later speaker could plausibly have seen the
    earlier claim (scope.md M7: "counting only those by agents who could have seen the
    earlier message"). This stub checks only that the later row is after the claim and not
    by the same agent; CUSTOMISE to also check channel/room membership once the real export's
    channel structure is known. Times are compared as instants, not strings, so fractional
    seconds and UTC offsets order correctly.
    """
    if _parse_ts(later_row["ts"]) <= _parse_ts(claim_ts):
        return False
    if later_row["agent"] == claim_agent:
        return False
    if channel_members is not None and later_row["agent"] not in channel_members:
        return False
    return True


def baseline_link(claim, later_rows: list[dict]) -> list[SpreadEdge]:
    """N-gram overlap baseline: no model, no notion of endorse/dispute/correct — every match
    is labelled "repeats". This exists so the model-based linker has to prove it adds
    something (M7's explicit requirement), not to be a good linker on its own.
    """
    claim_grams = _ngrams(claim.quote)
    edges = []
    for row in later_rows:
        if not could_have_seen(claim.agent, claim.ts, row):
            continue
        shared = claim_grams & _ngrams(row["text"])
        if len(shared) >= MIN_SHARED_NGRAMS:
            edges.append(
                SpreadEdge(claim_id=claim.claim_id, later_message_id=row["id"], relation="repeats", agent=row["agent"], ts=row["ts"])
            )
    return edges


RELATION_PROMPT = """You are told an earlier claim an AI agent made, and a later message from a
different agent who could have seen it. Decide the relation, if any:
  repeats   - restates the same claim as if true, without new evidence either way
  endorses  - explicitly agrees with or builds on the claim as true
  corrects  - states the claim was wrong, with a different fact in its place
  disputes  - says the claim is wrong or questions it, without giving a different fact
  none      - the later message is unrelated to the claim

Return JSON: {"relation": "repeats"|"endorses"|"corrects"|"disputes"|"none"}
"""


def model_link(
    claim, later_rows: list[dict], call_relation_classifier: Callable[[str, str], dict]
) -> list[SpreadEdge]:
    """LLM-based linker. Only rows the baseline would even consider temporally eligible are
    sent to the model, to keep the call count down; CUSTOMISE if you want the model to catch
    relations the n-gram filter misses entirely (then call it on every eligible later row
    instead of pre-filtering by `baseline_link`'s n-gram overlap).
    """
    edges = []
    for row in later_rows:
        if not could_have_seen(claim.agent, claim.ts, row):
            continue
        raw = call_relation_classifier(RELATION_PROMPT, f"EARLIER CLAIM: {claim.quote}\n\nLATER MESSAGE: {row['text']}")
        relation = raw.get("relation", "none")
        if relation in RELATIONS:
            edges.append(SpreadEdge(claim_id=claim.claim_id, later_message_id=row["id"], relation=relation, agent=row["agent"], ts=row["ts"]))
    return edges


def spread_share(verdicts: list, edges: list[SpreadEdge], relation: str) -> dict:
    """Share of claims (by verdict) that have at least one edge of `relation`. Used to compare
    false claims against supported claims (M7's headline comparison).
    """
    claims_with = {e.claim_id for e in edges if e.relation == relation}
    by_verdict: dict[str, list[int]] = {}
    for v in verdicts:
        by_verdict.setdefault(v.verdict, []).append(1 if v.claim_id in claims_with else 0)
    return {verdict: (sum(hits) / len(hits) if hits else float("nan")) for verdict, hits in by_verdict.items()}
