"""Property tests: invariants that must hold for any input, not just the hand-picked cases.

Hypothesis generates the inputs. The CI profile (see conftest.py) is derandomized, so a failure
reproduces from the same commit.
"""

import math
import random
import re
from datetime import datetime, timedelta, timezone

import pytest
from hypothesis import assume, given
from hypothesis import strategies as st

from check.checker import (
    VERDICTS,
    WINDOW_AFTER_SECONDS,
    WINDOW_BEFORE_SECONDS,
    Verdict,
    check_claim,
    evidence_window,
    window_text,
)
from eval.decision_curve import decision_curve
from eval.forecaster import Prediction, accuracy, auc, base_rate_predictor, brier_score
from eval.validation import cohen_kappa, perturb, perturbation_test
from extract.claims import Claim, chunk_rows, freeze_hash, parse_claims, render_row
from ingest.village import episode_rows
from report.headline import breakdown, sensitivity, shares, wilson
from spread.linker import SpreadEdge, spread_share

EPS = 1e-9
T0 = datetime(2025, 5, 1, tzinfo=timezone.utc)

# Text without surrogates so it round-trips through UTF-8 like the real export would.
text = st.text(st.characters(blacklist_categories=("Cs",)), max_size=200)
verdict_label = st.sampled_from(VERDICTS)
label = st.sampled_from(["supported", "contradicted", "unverifiable"])


def iso(offset_seconds: int) -> str:
    return (T0 + timedelta(seconds=offset_seconds)).strftime("%Y-%m-%dT%H:%M:%SZ")


# --- Wilson interval and shares --------------------------------------------------------------


@st.composite
def k_of_n(draw):
    n = draw(st.integers(1, 5000))
    return draw(st.integers(0, n)), n


@given(k_of_n())
def test_wilson_interval_is_ordered_and_inside_unit_interval(kn):
    k, n = kn
    p, lo, hi = wilson(k, n)
    assert p == k / n
    assert -EPS <= lo <= p + EPS
    assert p - EPS <= hi <= 1 + EPS


@given(k_of_n())
def test_wilson_is_monotone_in_k(kn):
    k, n = kn
    assume(k < n)
    _, lo_a, hi_a = wilson(k, n)
    _, lo_b, hi_b = wilson(k + 1, n)
    assert lo_a <= lo_b + EPS
    assert hi_a <= hi_b + EPS


@given(st.integers(0, 20), st.integers(1, 200))
def test_wilson_narrows_as_sample_grows_at_a_fixed_proportion(k, n):
    assume(k <= n)
    _, lo1, hi1 = wilson(k, n)
    _, lo2, hi2 = wilson(k * 10, n * 10)
    assert (hi2 - lo2) <= (hi1 - lo1) + EPS


@given(st.lists(st.tuples(verdict_label, st.sampled_from(["m1", "m2", "m3"]), st.integers(0, 90 * 86400)), min_size=1, max_size=60))
def test_shares_counts_add_up_and_never_merge_unverifiable(rows):
    records = [{"claim_id": str(i), "model": m, "ts": iso(s), "verdict": v, "extractor": "e1", "judge": "j1"} for i, (v, m, s) in enumerate(rows)]
    out = shares(records)
    assert out["n"] == len(records)
    assert sum(out[v]["k"] for v in VERDICTS) == len(records)
    assert sum(out[v]["p"] for v in VERDICTS) == pytest.approx(1.0)
    # "unverifiable" is counted on its own, whatever the other two do.
    assert out["unverifiable"]["k"] == sum(v == "unverifiable" for v, _, _ in rows)
    # Every group in a breakdown partitions the records.
    assert sum(g["n"] for g in breakdown(records, "model").values()) == len(records)


@given(st.lists(st.tuples(verdict_label, st.sampled_from(["e1", "e2"]), st.sampled_from(["j1", "j2"])), min_size=1, max_size=60))
def test_sensitivity_range_brackets_every_setting(rows):
    records = [{"claim_id": str(i), "model": "m", "ts": iso(0), "verdict": v, "extractor": e, "judge": j} for i, (v, e, j) in enumerate(rows)]
    out = sensitivity(records)
    for verdict in VERDICTS:
        lo, hi = out["range"][verdict]["min"], out["range"][verdict]["max"]
        assert lo <= hi
        assert all(lo - EPS <= s[verdict]["p"] <= hi + EPS for s in out["per_setting"].values())


# --- Agreement and forecaster scoring --------------------------------------------------------


@given(st.lists(st.tuples(label, label), min_size=1, max_size=100))
def test_kappa_is_bounded_and_symmetric(pairs):
    a, b = [p[0] for p in pairs], [p[1] for p in pairs]
    k = cohen_kappa(a, b)
    assert -1 - EPS <= k <= 1 + EPS
    assert k == pytest.approx(cohen_kappa(b, a))


@given(st.lists(label, min_size=1, max_size=100))
def test_kappa_of_identical_ratings_is_one(labels):
    assert cohen_kappa(labels, list(labels)) == 1.0


prediction = st.builds(
    Prediction,
    item_id=st.just("x"),
    probability=st.integers(0, 100).map(lambda i: i / 100),  # a grid, so 1 - p is exact
    outcome=st.booleans(),
)


@given(st.lists(prediction, min_size=1, max_size=80))
def test_forecaster_metrics_stay_in_range(preds):
    assert 0 <= brier_score(preds) <= 1
    assert 0 <= accuracy(preds) <= 1
    a = auc(preds)
    assert a is None or 0 <= a <= 1


@given(st.lists(prediction, min_size=1, max_size=80))
def test_base_rate_is_the_best_constant_forecast(preds):
    """The comparator in MVP.md M10 is only fair if no other constant beats it on Brier."""
    base = base_rate_predictor(preds)
    constant = lambda c: brier_score([Prediction(p.item_id, c, p.outcome) for p in preds])  # noqa: E731
    assert constant(base) <= constant(0.5) + EPS
    assert constant(base) <= constant(0.0) + EPS
    assert constant(base) <= constant(1.0) + EPS


@given(st.lists(prediction, min_size=2, max_size=60))
def test_auc_flips_when_the_forecast_is_inverted(preds):
    a = auc(preds)
    assume(a is not None)
    flipped = [Prediction(p.item_id, 1 - p.probability, p.outcome) for p in preds]
    assert auc(flipped) == pytest.approx(1 - a)


# --- Decision curve --------------------------------------------------------------------------


@given(st.lists(st.tuples(verdict_label, st.floats(0, 1, allow_nan=False)), min_size=1, max_size=60))
def test_decision_curve_is_a_monotone_walk_to_the_total(rows):
    verdicts = [Verdict(str(i), v, [], "j", c) for i, (v, c) in enumerate(rows)]
    points = decision_curve(verdicts)
    total_false = sum(v == "contradicted" for v, _ in rows)

    assert [p["claims_reviewed"] for p in points] == list(range(1, len(rows) + 1))
    caught = [p["false_claims_caught"] for p in points]
    assert all(b - a in (0, 1) for a, b in zip([0, *caught], caught))
    assert caught[-1] == total_false
    if total_false:
        assert points[-1]["share_caught"] == 1.0
    else:
        assert math.isnan(points[-1]["share_caught"])  # nothing to catch: undefined, not 0


@given(st.lists(st.tuples(verdict_label, st.integers(0, 64).map(lambda i: i / 64)), min_size=2, max_size=40, unique_by=lambda t: t[1]), st.randoms())
def test_decision_curve_does_not_depend_on_input_order(rows, rnd):
    """Distinct scores make the ranking total, so shuffling the claims must not move the curve."""
    verdicts = [Verdict(str(i), v, [], "j", c) for i, (v, c) in enumerate(rows)]
    shuffled = list(verdicts)
    rnd.shuffle(shuffled)
    key = lambda pts: [(p["claims_reviewed"], p["false_claims_caught"]) for p in pts]  # noqa: E731
    assert key(decision_curve(verdicts)) == key(decision_curve(shuffled))


# --- Chunking and quote validity -------------------------------------------------------------


@st.composite
def row_lists(draw):
    texts = draw(st.lists(st.text(st.characters(blacklist_categories=("Cs",)), max_size=300), min_size=1, max_size=15))
    agents = draw(st.lists(st.sampled_from(["alice", "bob", "carol"]), min_size=len(texts), max_size=len(texts)))
    return [
        {"id": f"r{i}", "episode_id": "e1", "agent": a, "ts": iso(i * 60), "source": "chat", "text": t}
        for i, (t, a) in enumerate(zip(texts, agents))
    ]


@given(row_lists(), st.integers(80, 500), st.integers(0, 2))
def test_chunks_cover_every_row_and_respect_the_size_limit(rows, max_chars, overlap):
    chunks = chunk_rows(rows, max_chars=max_chars, overlap=overlap)

    assert {rid for c in chunks for rid in c["row_ids"]} == {r["id"] for r in rows}  # nothing lost
    assert all(len(c["text"]) <= max_chars for c in chunks)
    assert [c["chunk_id"] for c in chunks] == [f"e1#{i}" for i in range(len(chunks))]

    order = {r["id"]: i for i, r in enumerate(rows)}
    for c in chunks:
        positions = [order[rid] for rid in c["row_ids"]]
        assert positions == sorted(positions)  # time order survives inside a chunk
        assert set(c["agents"]) == {rows[p]["agent"] for p in positions}

    if overlap == 0:
        flat = [rid for c in chunks for rid in c["row_ids"]]
        assert len(flat) == len(set(flat))  # no overlap requested, none produced


@given(row_lists(), st.integers(80, 500))
def test_a_row_that_fits_is_never_cut(rows, max_chars):
    chunks = chunk_rows(rows, max_chars=max_chars)
    for r in rows:
        rendered = render_row(r)
        if len(rendered) <= max_chars:
            assert any(rendered in c["text"] for c in chunks), "a whole row must appear intact in some chunk"
        else:
            assert any(r["id"] in c["row_ids"] and c["truncated"] for c in chunks)


@given(text, st.lists(text, max_size=8))
def test_parse_claims_only_keeps_quotes_that_are_in_the_chunk(chunk_text, quotes):
    chunk = {"chunk_id": "c0", "episode_id": "e1", "agents": ["a"], "text": chunk_text}
    kept, dropped = parse_claims({"claims": [{"quote": q} for q in quotes]}, chunk)
    assert len(kept) + len(dropped) == len(quotes)
    assert all(c.quote in chunk_text for c in kept)
    assert all(d["reason"] == "quote_not_in_chunk" for d in dropped)


@given(text, text)
def test_freeze_hash_is_a_sha256_that_tracks_the_text(a, b):
    h = freeze_hash(a)
    assert re.fullmatch(r"[0-9a-f]{64}", h)
    assert (h == freeze_hash(b)) == (a == b)


# --- Checker -----------------------------------------------------------------------------------


@st.composite
def agent_rows(draw):
    n = draw(st.integers(0, 20))
    return [
        {
            "id": f"r{i}",
            "agent": draw(st.sampled_from(["a", "b"])),
            "ts": iso(draw(st.integers(-3 * 86400, 3 * 86400))),
            "source": draw(st.sampled_from(["chat", "memory"])),
            "text": draw(text),
        }
        for i in range(n)
    ]


@given(agent_rows())
def test_evidence_window_is_a_same_agent_time_bounded_subset(rows):
    claim_ts = iso(0)
    window = evidence_window(rows, claim_ts, "a")
    assert all(r in rows for r in window)
    for r in window:
        assert r["agent"] == "a"
        offset = (datetime.fromisoformat(r["ts"].replace("Z", "+00:00")) - T0).total_seconds()
        assert -WINDOW_BEFORE_SECONDS <= offset <= WINDOW_AFTER_SECONDS
    # Nothing eligible is left out, and the window is in time order (ties by id).
    expected = [r for r in rows if r["agent"] == "a" and -WINDOW_BEFORE_SECONDS <= (datetime.fromisoformat(r["ts"].replace("Z", "+00:00")) - T0).total_seconds() <= WINDOW_AFTER_SECONDS]
    assert window == sorted(expected, key=lambda r: (datetime.fromisoformat(r["ts"].replace("Z", "+00:00")), r["id"]))


@given(
    st.lists(st.text(st.characters(blacklist_categories=("Cs",)), min_size=1, max_size=30), min_size=1, max_size=4),
    st.lists(text, max_size=5),
    st.one_of(verdict_label, st.text(max_size=12)),
)
def test_check_claim_never_returns_evidence_outside_the_window(window_texts, evidence, claimed_verdict):
    """The checker may say anything. What leaves `check_claim` must be a known label whose evidence is
    all real text from the window."""
    window = [{"id": f"r{i}", "agent": "a", "ts": iso(i), "source": "chat", "text": t} for i, t in enumerate(window_texts)]
    claim = Claim("c1", "e1", "a", "", iso(0), "chat", "q", "x", True)
    verdict = check_claim(claim, window, lambda p, t: {"verdict": claimed_verdict, "evidence": evidence, "confidence": 0.5}, "j")

    assert verdict.verdict in VERDICTS
    assert all(q in window_text(window) for q in verdict.evidence)
    if evidence and not verdict.evidence:
        assert verdict.verdict == "unverifiable"  # fabricated evidence must not stand as a verdict


# --- Validation and ingest ---------------------------------------------------------------------


@given(st.text(st.characters(whitelist_categories=("L", "Zs")), max_size=20), st.integers(0, 10**12), st.text(st.characters(whitelist_categories=("L", "Zs")), max_size=20), st.integers(0, 10**6))
def test_perturb_changes_only_the_number(prefix, number, suffix, seed):
    quote = f"{prefix} {number} {suffix}"
    out = perturb(quote, random.Random(seed))
    assert out is not None and out != quote
    match = re.search(r"\b\d+(\.\d+)?\b", quote)
    assert out.startswith(quote[: match.start()])
    assert out.endswith(quote[match.end() :])


@given(st.lists(st.text(st.sampled_from("abc 0123456789"), max_size=25), max_size=20), st.integers(0, 1000))
def test_perturbation_test_is_deterministic_and_consistent(quotes, seed):
    claims = [Claim(str(i), "e1", "a", "", iso(0), "chat", q, "x", True) for i, q in enumerate(quotes)]
    run = lambda c: "supported" if c.quote == "" else "contradicted"  # noqa: E731
    first = perturbation_test(claims, run, seed=seed)
    assert first == perturbation_test(claims, run, seed=seed) or all(math.isnan(v) for k, v in first.items() if k == "share_caught")
    assert first["n_caught"] <= first["n_perturbable"] <= len(claims)


@given(st.lists(st.tuples(verdict_label, st.booleans()), min_size=1, max_size=40))
def test_spread_share_is_a_proportion_per_verdict(rows):
    verdicts = [Verdict(str(i), v, [], "j", 0.5) for i, (v, _) in enumerate(rows)]
    edges = [SpreadEdge(str(i), f"r{i}", "repeats", "b", iso(1)) for i, (_, hit) in enumerate(rows) if hit]
    out = spread_share(verdicts, edges, "repeats")
    assert set(out) == {v for v, _ in rows}
    for verdict, share in out.items():
        members = [hit for v, hit in rows if v == verdict]
        assert share == sum(members) / len(members)


@given(
    st.lists(
        st.tuples(st.sampled_from(["e1", "e2"]), st.integers(0, 10**6), st.sampled_from(["Z", "+00:00"])),
        max_size=30,
    )
)
def test_episode_rows_filters_and_sorts_by_real_time(items):
    messages = [
        {"id": f"m{i}", "episode_id": ep, "agent": "a", "model": "", "ts": iso(s).replace("Z", zone), "source": "chat", "text": ""}
        for i, (ep, s, zone) in enumerate(items)
    ]
    rows = episode_rows(messages, [], "e1")
    assert {r["id"] for r in rows} == {m["id"] for m in messages if m["episode_id"] == "e1"}
    times = [datetime.fromisoformat(r["ts"].replace("Z", "+00:00")) for r in rows]
    assert times == sorted(times)
