import pytest

from extract.claims import CLAIM_PROMPT, CLAIM_PROMPT_E2, chunk_rows, render_row
from extract.run import extract_requests, extractor_spec, pick_chunks, run_extraction
from llm.client import ModelClient, ReplyNotJSON

ROW = {"id": "r1", "agent": "a", "model": "m", "ts": "2025-05-01T00:00:00Z", "source": "chat", "text": "I filed the report"}


def chunk(n, text="I filed the report"):
    return {"chunk_id": f"c{n}", "episode_id": "e", "agents": ["a"], "text": text, "rows": [{**ROW, "id": f"r{n}", "text": text}], "row_ids": [f"r{n}"], "truncated": False}


def reply(*quotes):
    return {"claims": [{"quote": q, "agent": "a", "claim_type": "self-report", "checkable": True} for q in quotes]}


def test_the_shipped_extractor_is_haiku_with_prices_and_no_temperature():
    spec = extractor_spec()
    assert spec.label == "anthropic/claude-haiku-5-5" and spec.temperature is None
    assert spec.cost(1_000_000, 1_000_000) == pytest.approx(0.6)


def test_a_config_without_an_extractor_is_an_error(tmp_path):
    path = tmp_path / "config.toml"
    path.write_text("[spend]\ncap_gbp = 1\n")
    with pytest.raises(ValueError, match="extractor"):
        extractor_spec(path)


def test_pick_chunks_spreads_evenly_and_is_repeatable():
    chunks = [chunk(i) for i in range(100)]
    picked = pick_chunks(chunks, 10)
    assert [c["chunk_id"] for c in picked] == [f"c{i}" for i in range(0, 100, 10)]
    assert picked == pick_chunks(chunks, 10)


def test_pick_chunks_returns_everything_when_asked_for_more_than_there_are():
    chunks = [chunk(i) for i in range(3)]
    assert pick_chunks(chunks, 3) == chunks and pick_chunks(chunks, 50) == chunks and pick_chunks(chunks, 0) == []
    with pytest.raises(ValueError):
        pick_chunks(chunks, -1)


def test_requests_pair_the_chosen_prompt_with_each_chunk_text():
    chunks = [chunk(1, "one"), chunk(2, "two")]
    assert extract_requests(chunks, "e1") == [(CLAIM_PROMPT, "one"), (CLAIM_PROMPT, "two")]
    assert extract_requests(chunks, "e2")[0][0] == CLAIM_PROMPT_E2
    with pytest.raises(ValueError, match="unknown extractor"):
        extract_requests(chunks, "e9")


def test_a_quote_not_in_the_chunk_is_dropped_and_counted():
    claims, dropped = run_extraction([chunk(1)], lambda p, t: reply("I filed the report", "something never said"))
    assert [c.quote for c in claims] == ["I filed the report"] and claims[0].extractor == "e1"
    assert dropped == [{"chunk_id": "c1", "index": 1, "reason": "quote_not_in_chunk"}]


def test_a_bad_reply_is_recorded_and_the_run_goes_on_when_asked():
    calls = iter([ReplyNotJSON("no json"), reply("I filed the report")])

    def caller(prompt, text):
        out = next(calls)
        if isinstance(out, Exception):
            raise out
        return out

    failed = []
    claims, _ = run_extraction([chunk(1), chunk(2)], caller, failed=failed)
    assert failed == ["c1"] and [c.claim_id for c in claims] == ["c2-e1-0"]


def test_a_bad_reply_stops_the_run_by_default():
    def caller(prompt, text):
        raise ReplyNotJSON("no json")

    with pytest.raises(ReplyNotJSON):
        run_extraction([chunk(1)], caller)


@pytest.mark.parametrize("bad", [{"claims": "none"}, {"claims": ["a string"]}, {"claims": [1, 2]}])
def test_claims_that_are_not_a_list_of_objects_count_as_a_bad_reply(bad):
    failed = []
    claims, _ = run_extraction([chunk(1)], lambda p, t: bad, failed=failed)
    assert claims == [] and failed == ["c1"]


def test_an_empty_or_missing_claims_list_is_no_claims_not_a_failure():
    failed = []
    assert run_extraction([chunk(1)], lambda p, t: {}, failed=failed) == ([], []) and failed == []


def test_a_cached_rerun_makes_no_call():
    from llm.client import Completion

    chunks = [chunk(1), chunk(2, "I sent the invoice")]
    spec = extractor_spec()
    seen = []

    def transport(spec, system, user):
        seen.append(user)
        return Completion('{"claims": []}', 10, 5)

    client = ModelClient(spec, transport, cache_path=":memory:", mode="live")
    run_extraction(chunks, client.as_caller())
    estimate = client.estimate(extract_requests(chunks))
    assert len(seen) == 2 and estimate.n_live == 0 and estimate.n_cached == 2


def test_two_extractors_never_give_two_claims_the_same_id():
    """e1 and e2 read the same chunks. With `{chunk}-{i}` ids their first claims collided, and anything keyed
    by claim_id (kappa, the decision curve, spread) would have merged two different claims."""
    c = chunk(1)
    e1, _ = run_extraction([c], lambda p, t: reply("I filed the report"), "e1")
    e2, _ = run_extraction([c], lambda p, t: reply("I filed the report"), "e2")
    assert e1[0].claim_id != e2[0].claim_id and {e1[0].claim_id, e2[0].claim_id} == {"c1-e1-0", "c1-e2-0"}


def test_a_quote_from_the_row_two_chunks_share_is_kept_once():
    rows = [{**ROW, "episode_id": "e", "id": f"r{n}", "text": text} for n, text in enumerate(["we sold 12 shirts", "the store is live", "bob agreed"])]
    chunks = chunk_rows(rows, max_chars=2 * len(render_row(rows[1])), overlap=1)
    assert [c["row_ids"] for c in chunks] == [["r0", "r1"], ["r1", "r2"]]  # r1 is in both
    claims, dropped = run_extraction(chunks, lambda p, t: reply("the store is live"))
    assert [c.row_id for c in claims] == ["r1"]
    assert [d["reason"] for d in dropped] == ["repeat_from_overlap"]
