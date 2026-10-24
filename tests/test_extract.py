from extract.claims import chunk_rows, freeze_hash, parse_claims, validate_quote


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
