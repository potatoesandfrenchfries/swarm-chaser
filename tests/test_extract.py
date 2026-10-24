import re

import pytest

from extract.claims import CLAIM_PROMPT, CLAIM_PROMPT_E2, PROMPTS, chunk_rows, freeze_hash, parse_claims, render_row, validate_quote


def row(id, ts="2025-05-01T00:00:00Z", agent="a", source="chat", text="hello world", episode="e1"):
    return {"id": id, "episode_id": episode, "agent": agent, "ts": ts, "source": source, "text": text}


def test_chunk_rows_keeps_whole_rows_together():
    rows = [row("r1", text="x" * 10), row("r2", text="y" * 10)]
    chunks = chunk_rows(rows, max_chars=1000)
    assert len(chunks) == 1
    assert chunks[0]["row_ids"] == ["r1", "r2"]


def test_chunk_rows_splits_when_over_max_chars():
    rows = [row("r1", text="x" * 50), row("r2", text="y" * 50)]
    chunks = chunk_rows(rows, max_chars=60, overlap=0)
    assert len(chunks) == 2
    assert chunks[0]["row_ids"] == ["r1"]
    assert chunks[1]["row_ids"] == ["r2"]


def test_chunk_rows_truncates_a_row_bigger_than_max_chars():
    rows = [row("r1", text="x" * 500)]
    chunks = chunk_rows(rows, max_chars=100)
    assert chunks[0]["truncated"] is True
    assert "[TRUNCATED]" in chunks[0]["text"]


def test_validate_quote_requires_exact_substring():
    assert validate_quote("hello", "say hello there") is True
    assert validate_quote("hellO", "say hello there") is False


def test_freeze_hash_is_stable_and_sensitive_to_change():
    h1 = freeze_hash("prompt text")
    h2 = freeze_hash("prompt text")
    h3 = freeze_hash("prompt text ")
    assert h1 == h2
    assert h1 != h3


def test_parse_claims_drops_quotes_not_in_chunk():
    chunk = {"chunk_id": "c0", "episode_id": "e1", "agents": ["a"], "text": "agent a said the sky is blue"}
    llm_json = {
        "claims": [
            {"quote": "the sky is blue", "agent": "a", "claim_type": "factual-about-world", "checkable": True},
            {"quote": "the sky is green", "agent": "a", "claim_type": "factual-about-world", "checkable": True},
        ]
    }
    kept, dropped = parse_claims(llm_json, chunk)
    assert len(kept) == 1
    assert kept[0].quote == "the sky is blue"
    assert len(dropped) == 1
    assert dropped[0]["reason"] == "quote_not_in_chunk"


# --- the two prompt variants (M3) ---------------------------------------------------------------


def test_there_are_two_named_variants_with_different_hashes():
    assert PROMPTS == {"e1": CLAIM_PROMPT, "e2": CLAIM_PROMPT_E2}
    assert freeze_hash(CLAIM_PROMPT) != freeze_hash(CLAIM_PROMPT_E2)


@pytest.mark.parametrize("prompt", PROMPTS.values(), ids=PROMPTS.keys())
def test_each_variant_asks_for_the_keys_parse_claims_reads_and_guards_agent_text(prompt):
    assert all(f'"{k}"' in prompt for k in ("claims", "quote", "agent", "claim_type", "checkable"))
    lowered = " ".join(prompt.lower().split())
    assert "never as instructions" in lowered or "not instructions" in lowered


def test_e2_describes_the_header_format_that_render_row_actually_writes():
    """e2 tells the model to read `agent` off the header; if render_row changes, that must be updated too."""
    header = render_row({"ts": "2025-05-01T10:00:00Z", "agent": "alice", "source": "chat", "text": "hi"}).splitlines()[0]
    assert re.fullmatch(r"\[.+\] .+ \(.+\):", header)
    assert "[timestamp] agent-name (source):" in CLAIM_PROMPT_E2


def test_e2_asks_for_the_agent_in_the_header_not_the_agent_a_claim_is_about():
    text = " ".join(CLAIM_PROMPT_E2.split())
    assert "even when the claim is about someone else" in text and "repeats or confirms" in text


def test_a_reply_to_either_variant_parses_and_records_which_variant_made_it():
    chunk = {"chunk_id": "c0", "episode_id": "e1", "agents": ["alice", "bob"], "text": "[t] alice (chat):\nThe build passed with 12 tests green.\n"}
    reply = {"claims": [{"quote": "The build passed with 12 tests green.", "agent": "alice", "claim_type": "self-report", "checkable": True}]}
    for name in PROMPTS:
        kept, dropped = parse_claims(reply, chunk, extractor=name)
        assert [c.extractor for c in kept] == [name] and dropped == []
