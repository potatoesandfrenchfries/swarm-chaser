import pytest

from llm.budget import remaining_usd, spent_usd, total_cap_usd
from llm.client import Completion, ModelClient, ModelSpec, SpendCapExceeded

SPEC = ModelSpec("v", "m", temperature=None, max_tokens=100, usd_per_mtok_in=1_000_000.0, usd_per_mtok_out=2_000_000.0)  # $1 per input token, $2 per output token


def config(tmp_path, body='cap_gbp = 3.0\nusd_per_gbp = 1.25\n'):
    path = tmp_path / "config.toml"
    path.write_text(f"[spend]\n{body}")
    return path


def cache_with(tmp_path, *calls):
    """A cache file holding one cached answer per (user text, tokens_in, tokens_out), as a live run would leave it."""
    path = tmp_path / "llm.sqlite"
    client = ModelClient(SPEC, lambda spec, system, user: Completion("{}", *dict((u, (i, o)) for u, i, o in calls)[user]), cache_path=path, mode="live")
    for user, _, _ in calls:
        client.complete("sys", user)
    client.close()
    return path


def test_the_shipped_budget_is_three_pounds_at_a_rate_kept_a_little_low():
    assert total_cap_usd() == pytest.approx(3.75)


def test_a_missing_or_nonsense_budget_is_an_error(tmp_path):
    with pytest.raises(ValueError, match="cap_gbp"):
        total_cap_usd(config(tmp_path, "usd_per_gbp = 1.25\n"))
    with pytest.raises(ValueError, match="positive"):
        total_cap_usd(config(tmp_path, "cap_gbp = 0\nusd_per_gbp = 1.25\n"))
    with pytest.raises(ValueError, match="positive"):
        total_cap_usd(config(tmp_path, "cap_gbp = 3\nusd_per_gbp = -1\n"))


def test_nothing_spent_when_there_is_no_cache_yet(tmp_path):
    assert spent_usd(tmp_path / "none.sqlite", [SPEC]) == 0.0
    assert spent_usd(":memory:", [SPEC]) == 0.0


def test_an_empty_cache_file_with_no_calls_table_is_nothing_spent(tmp_path):
    import sqlite3

    path = tmp_path / "empty.sqlite"
    sqlite3.connect(path).close()
    assert spent_usd(path, [SPEC]) == 0.0


def test_spend_is_the_cached_token_counts_at_the_specs_prices(tmp_path):
    cache = cache_with(tmp_path, ("a", 1, 1), ("b", 2, 0))  # (1 in + 1 out) + (2 in) = $1 + $2 + $2
    assert spent_usd(cache, [SPEC]) == pytest.approx(5.0)


def test_an_answer_from_an_unpriced_model_stops_the_total_rather_than_counting_as_free(tmp_path):
    cache = cache_with(tmp_path, ("a", 1, 1))
    other = ModelSpec("other", "x", temperature=None)
    with pytest.raises(ValueError, match="v/m"):
        spent_usd(cache, [other])
    with pytest.raises(ValueError, match="v/m"):
        spent_usd(cache, [ModelSpec("v", "m", temperature=None)])  # same model, no prices


def test_the_remainder_is_the_budget_less_the_spend_and_never_negative(tmp_path):
    cache = cache_with(tmp_path, ("a", 1, 1))  # $3 spent
    assert remaining_usd(cache, [SPEC], config(tmp_path, "cap_gbp = 4\nusd_per_gbp = 1.0\n")) == pytest.approx(1.0)
    assert remaining_usd(cache, [SPEC], config(tmp_path, "cap_gbp = 2\nusd_per_gbp = 1.0\n")) == 0.0


def test_a_new_process_is_held_to_the_total_not_to_a_fresh_zero(tmp_path):
    """The reason this module exists: ModelClient alone forgets earlier spend."""
    cache = cache_with(tmp_path, ("a", 1, 1))  # $3 already spent
    budget = config(tmp_path, "cap_gbp = 4\nusd_per_gbp = 1.0\n")  # $4 in all, so $1 left
    client = ModelClient(SPEC, lambda spec, system, user: Completion("{}", 1, 1), cache_path=cache, mode="live", spend_cap_usd=remaining_usd(cache, [SPEC], budget))
    with pytest.raises(SpendCapExceeded):
        client.complete("sys", "a brand new request")  # worst case 1 in + 100 out tokens costs far more than $1
    assert client.live_calls == 0


def test_a_cached_answer_still_costs_nothing_once_the_budget_is_gone(tmp_path):
    cache = cache_with(tmp_path, ("a", 1, 1))
    client = ModelClient(SPEC, lambda *a: pytest.fail("called"), cache_path=cache, mode="live", spend_cap_usd=0.0)
    assert client.complete("sys", "a").text == "{}"
    assert client.live_calls == 0
