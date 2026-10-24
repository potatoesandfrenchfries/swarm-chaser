"""The shared model client (M13.1): cache, offline/live modes, estimates, spend cap, JSON replies.

Everything uses a scripted fake transport, so no key, network or SDK is needed.
"""

import importlib.util
import sqlite3
import sys
import types

import pytest

from conftest import REPO_ROOT
from llm.client import CacheMiss, Completion, ModelClient, ModelSpec, ReplyNotJSON, SpendCapExceeded, estimate_tokens, parse_json_object, request_key

SPEC = ModelSpec("fake", "model-a", usd_per_mtok_in=1.0, usd_per_mtok_out=2.0, max_tokens=100)


class FakeTransport:
    def __init__(self, text='{"verdict": "supported"}', tokens_in=10, tokens_out=5):
        self.calls = []
        self.reply = Completion(text, tokens_in, tokens_out)

    def __call__(self, spec, system, user):
        self.calls.append((spec.label, system, user))
        return self.reply


def live(transport=None, spec=SPEC, **kw):
    return ModelClient(spec, transport or FakeTransport(), cache_path=":memory:", mode="live", **kw)


def test_a_repeated_request_is_answered_from_the_cache_with_one_call():
    t = FakeTransport()
    c = live(t)
    first, second = c.complete("sys", "user"), c.complete("sys", "user")
    assert first == second and len(t.calls) == 1
    assert (c.live_calls, c.cache_hits) == (1, 1)


@pytest.mark.parametrize(
    "other",
    [
        ModelSpec("fake", "model-b"),
        ModelSpec("other-vendor", "model-a"),
        ModelSpec("fake", "model-a", temperature=0.7),
        ModelSpec("fake", "model-a", max_tokens=5),
    ],
)
def test_the_key_changes_with_the_model_and_its_settings(other):
    assert request_key(other, "s", "u") != request_key(SPEC, "s", "u")


def test_the_key_changes_with_either_text_and_does_not_confuse_where_the_split_is():
    assert request_key(SPEC, "a", "bc") != request_key(SPEC, "ab", "c")
    assert request_key(SPEC, "s", "u1") != request_key(SPEC, "s", "u2")


def test_offline_mode_serves_the_cache_and_refuses_a_miss(tmp_path):
    path = tmp_path / "c.sqlite"
    ModelClient(SPEC, FakeTransport(), path, mode="live").complete("s", "u")
    t = FakeTransport()
    off = ModelClient(SPEC, t, path)  # offline is the default
    assert off.complete("s", "u").text == '{"verdict": "supported"}'
    with pytest.raises(CacheMiss):
        off.complete("s", "never asked")
    assert t.calls == []


def test_offline_is_the_default_so_a_paid_call_needs_an_explicit_switch():
    with pytest.raises(CacheMiss):
        ModelClient(SPEC, FakeTransport(), ":memory:").complete("s", "u")


def test_the_cache_holds_no_timestamp_and_two_runs_write_the_same_rows(tmp_path):
    rows = []
    for name in ("a.sqlite", "b.sqlite"):
        c = ModelClient(SPEC, FakeTransport(), tmp_path / name, mode="live")
        c.complete("s", "u")
        c.close()
        con = sqlite3.connect(tmp_path / name)
        assert not [col for col in con.execute("PRAGMA table_info(calls)") if "time" in col[1] or "date" in col[1]]
        rows.append(con.execute("SELECT * FROM calls").fetchall())
    assert rows[0] == rows[1]


def test_the_cache_stores_a_hash_of_the_system_prompt_for_provenance():
    c = live()
    c.complete("the frozen prompt", "u")
    (sha,) = c._db.execute("SELECT system_sha256 FROM calls").fetchone()
    from extract.claims import freeze_hash

    assert sha == freeze_hash("the frozen prompt")


def test_live_mode_needs_a_transport_and_a_cap_needs_prices_and_the_mode_is_checked():
    with pytest.raises(ValueError, match="transport"):
        ModelClient(SPEC, None, ":memory:", mode="live")
    with pytest.raises(ValueError, match="prices"):
        ModelClient(ModelSpec("fake", "free"), FakeTransport(), ":memory:", mode="live", spend_cap_usd=1.0)
    with pytest.raises(ValueError, match="mode"):
        ModelClient(SPEC, None, ":memory:", mode="dry")


def test_the_spend_cap_stops_a_call_before_it_is_made():
    t = FakeTransport(tokens_in=1_000_000, tokens_out=0)  # $1.00 actual
    c = live(t, spend_cap_usd=1.0)
    c.complete("s", "first")
    assert c.spent_usd == pytest.approx(1.0)
    with pytest.raises(SpendCapExceeded):
        c.complete("s", "second")
    assert len(t.calls) == 1


def test_a_cached_answer_costs_nothing_even_at_the_cap():
    t = FakeTransport(tokens_in=1_000_000, tokens_out=0)
    c = live(t, spend_cap_usd=1.0)
    c.complete("s", "u")
    c.complete("s", "u")
    assert c.spent_usd == pytest.approx(1.0) and len(t.calls) == 1


def test_estimate_counts_only_uncached_unique_requests():
    c = live()
    c.complete("sys", "cached")
    est = c.estimate([("sys", "cached"), ("sys", "new one"), ("sys", "new one"), ("sys", "another")])
    assert (est.n_requests, est.n_cached, est.n_live) == (3, 1, 2)
    assert est.tokens_in == 2 * estimate_tokens("sys") + estimate_tokens("new one") + estimate_tokens("another")
    assert est.tokens_out == 2 * SPEC.max_tokens
    assert est.cost_usd == pytest.approx((est.tokens_in * 1.0 + est.tokens_out * 2.0) / 1e6)
    assert est.within_cap is None  # no cap set


def test_estimate_says_whether_the_batch_fits_the_cap_and_makes_no_call():
    t = FakeTransport()
    c = live(t, spend_cap_usd=0.0001)
    est = c.estimate([("s", "x" * 4000)])
    assert est.within_cap is False and t.calls == []


def test_estimate_without_prices_reports_unknown_cost_not_zero():
    est = ModelClient(ModelSpec("fake", "free"), None, ":memory:").estimate([("s", "u")])
    assert est.cost_usd is None and est.within_cap is None


@pytest.mark.parametrize(
    "reply",
    ['{"a": 1}', '```json\n{"a": 1}\n```', 'Here you go: {"a": 1} Hope that helps.'],
)
def test_json_is_found_inside_fences_and_chatter(reply):
    assert parse_json_object(reply) == {"a": 1}


@pytest.mark.parametrize("reply", ["no json at all", "{broken: json}", "} backwards {", ""])
def test_a_reply_without_json_raises_rather_than_becoming_an_empty_answer(reply):
    with pytest.raises(ReplyNotJSON):
        parse_json_object(reply)


def test_as_caller_has_the_shape_the_stages_take():
    from check.checker import check_claim
    from extract.claims import Claim

    caller = live(FakeTransport('{"verdict": "supported", "evidence": ["it was done"], "confidence": 0.8}')).as_caller()
    claim = Claim("c1", "e1", "alice", "m", "2025-05-01T10:00:00Z", "chat", "q", "x", True)
    window = [{"id": "r1", "agent": "alice", "ts": "2025-05-01T10:05:00Z", "source": "chat", "text": "it was done"}]
    assert check_claim(claim, window, caller, "fake").verdict == "supported"


# --- the vendor adapters, against fake SDKs --------------------------------------------------------


def load_vendors():
    spec = importlib.util.spec_from_file_location("vendors", REPO_ROOT / "adapters" / "vendors.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fake_module(name, **attrs):
    mod = types.ModuleType(name)
    mod.__dict__.update(attrs)
    return mod


def test_unknown_vendor_is_rejected_and_importing_the_adapters_needs_no_sdk():
    vendors = load_vendors()
    with pytest.raises(ValueError, match="unknown vendor"):
        vendors.make_transport("nope")


def test_anthropic_transport_maps_the_reply_and_usage(monkeypatch):
    pytest.importorskip("tenacity")
    pytest.importorskip("dotenv")
    seen = {}

    class Messages:
        def create(self, **kw):
            seen.update(kw)
            block = types.SimpleNamespace(type="text", text='{"ok": true}')
            return types.SimpleNamespace(content=[block], usage=types.SimpleNamespace(input_tokens=7, output_tokens=3))

    monkeypatch.setitem(sys.modules, "anthropic", fake_module("anthropic", Anthropic=lambda api_key: types.SimpleNamespace(messages=Messages())))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "placeholder")
    out = load_vendors().make_transport("anthropic")(ModelSpec("anthropic", "m", temperature=None), "sys", "user")
    assert out == Completion('{"ok": true}', 7, 3)
    assert seen["system"] == "sys" and seen["messages"] == [{"role": "user", "content": "user"}] and "temperature" not in seen


def test_a_missing_key_names_the_variable(monkeypatch):
    pytest.importorskip("tenacity")
    dotenv = pytest.importorskip("dotenv")
    monkeypatch.setattr(dotenv, "load_dotenv", lambda: None)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setitem(sys.modules, "openai", fake_module("openai", OpenAI=lambda **kw: None))
    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        load_vendors().make_transport("openrouter")


def test_openai_transport_uses_its_own_key_and_no_base_url(monkeypatch):
    pytest.importorskip("tenacity")
    pytest.importorskip("dotenv")
    seen, built = {}, {}

    class Completions:
        def create(self, **kw):
            seen.update(kw)
            message = types.SimpleNamespace(content='{"ok": true}')
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=message)], usage=types.SimpleNamespace(prompt_tokens=9, completion_tokens=4))

    def build(**kw):
        built.update(kw)
        return types.SimpleNamespace(chat=types.SimpleNamespace(completions=Completions()))

    monkeypatch.setitem(sys.modules, "openai", fake_module("openai", OpenAI=build))
    monkeypatch.setenv("OPENAI_API_KEY", "placeholder")
    out = load_vendors().make_transport("openai")(ModelSpec("openai", "m", temperature=None), "sys", "user")
    assert out == Completion('{"ok": true}', 9, 4)
    assert built == {"api_key": "placeholder"}  # not OpenRouter's endpoint
    assert seen["messages"][0] == {"role": "system", "content": "sys"} and "temperature" not in seen


def test_a_missing_openai_key_names_the_variable(monkeypatch):
    pytest.importorskip("tenacity")
    dotenv = pytest.importorskip("dotenv")
    monkeypatch.setattr(dotenv, "load_dotenv", lambda: None)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setitem(sys.modules, "openai", fake_module("openai", OpenAI=lambda **kw: None))
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        load_vendors().make_transport("openai")


def test_openrouter_still_points_at_its_own_endpoint(monkeypatch):
    pytest.importorskip("tenacity")
    pytest.importorskip("dotenv")
    built = {}
    monkeypatch.setitem(sys.modules, "openai", fake_module("openai", OpenAI=lambda **kw: built.update(kw) or types.SimpleNamespace()))
    monkeypatch.setenv("OPENROUTER_API_KEY", "placeholder")
    load_vendors().make_transport("openrouter")
    assert built == {"api_key": "placeholder", "base_url": "https://openrouter.ai/api/v1"}
