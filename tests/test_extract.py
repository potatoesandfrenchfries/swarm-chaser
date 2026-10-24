import re

import pytest

from extract.claims import CLAIM_PROMPT, CLAIM_PROMPT_E2, PROMPTS, chunk_rows, freeze_hash, parse_claims, render_row, source_row, validate_quote


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


# --- claims know which row they came from (M3.1) ------------------------------------------------------


def two_rows():
    return [
        {**row("m1", ts="2025-05-01T10:00:00.000000Z", agent="alice", text="The build passed with 12 tests green."), "model": "model-x"},
        {**row("m2", ts="2025-05-01T11:00:00.000000Z", agent="bob", text="Confirming: the build passed with 12 tests green."), "model": "model-y", "source": "memory"},
    ]


def test_a_chunk_carries_the_rows_it_was_built_from():
    (chunk,) = chunk_rows(two_rows())
    assert [r["id"] for r in chunk["rows"]] == ["m1", "m2"]
    assert set(chunk["rows"][0]) == {"id", "agent", "model", "ts", "source", "text"}


def test_a_kept_claim_takes_speaker_model_time_and_source_from_its_row_not_from_the_model():
    (chunk,) = chunk_rows(two_rows())
    reply = {"claims": [{"quote": "Confirming: the build passed", "agent": "the wrong name", "claim_type": "self-report", "checkable": True}]}
    (c,), dropped = parse_claims(reply, chunk)
    assert dropped == []
    assert (c.agent, c.model, c.ts, c.source, c.row_id) == ("bob", "model-y", "2025-05-01T11:00:00.000000Z", "memory", "m2")


def test_when_two_rows_hold_the_quote_the_named_speaker_wins_else_the_first():
    (chunk,) = chunk_rows(two_rows())
    quote = "build passed with 12 tests green."
    assert source_row(quote, chunk, "bob")["id"] == "m2"
    assert source_row(quote, chunk, "nobody")["id"] == "m1"
    assert source_row("no such text", chunk) is None


def test_a_quote_that_runs_across_two_messages_is_dropped_because_it_has_no_one_speaker_or_time():
    (chunk,) = chunk_rows(two_rows())
    spanning = chunk["text"][chunk["text"].index("12 tests green."): chunk["text"].index("Confirming")]
    kept, dropped = parse_claims({"claims": [{"quote": spanning}]}, chunk)
    assert kept == [] and dropped[0]["reason"] == "quote_not_in_one_row"


def test_a_quote_that_includes_the_header_line_is_not_in_one_row_either():
    (chunk,) = chunk_rows(two_rows())
    header_quote = chunk["text"].splitlines()[0]
    kept, dropped = parse_claims({"claims": [{"quote": header_quote}]}, chunk)
    assert kept == [] and dropped[0]["reason"] == "quote_not_in_one_row"


def test_a_hand_built_chunk_without_rows_still_parses_with_the_models_agent():
    chunk = {"chunk_id": "c0", "episode_id": "e1", "agents": ["a"], "text": "agent a said hi"}
    (c,), _ = parse_claims({"claims": [{"quote": "said hi", "agent": "a"}]}, chunk)
    assert (c.agent, c.ts, c.row_id) == ("a", "", "")
