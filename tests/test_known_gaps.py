"""Defects found by reading the code and probing it. Each test states the correct behaviour and is
marked `xfail(strict=True)`, so it is a visible to-do rather than a silent hole:

  * CI stays green while the gap exists;
  * the moment someone fixes it, the test XPASSes, strict mode turns that into a failure, and the
    marker has to be deleted. The test then guards the fix permanently.

Nothing in src/ was changed to make these pass or fail. See `pipeline-rules` for the rules involved.
"""

import pytest

from check.checker import CHECKER_PROMPT, check_claim, evidence_window
from eval.forecaster import FORECASTER_PROMPT
from extract.claims import CLAIM_PROMPT, Claim, parse_claims
from lab.arms import LabRun, validate_run
from spread.linker import RELATION_PROMPT, could_have_seen

pytestmark = pytest.mark.gaps

CHUNK = {"chunk_id": "c0", "episode_id": "e1", "agents": ["a"], "text": "agent a said hi"}


def claim(ts="2025-05-01T00:00:00Z"):
    return Claim("c1", "e1", "a", "", ts, "chat", "q", "x", True)


def window(text="nothing relevant"):
    return [{"id": "r1", "agent": "a", "ts": "2025-05-01T00:00:00Z", "source": "chat", "text": text}]


# --- extract: a claim must carry a real quote and a time ----------------------------------------


@pytest.mark.xfail(strict=True, reason="validate_quote('') is True, so a claim with a missing or empty quote is kept; "
                   "breaks 'every quote is an exact substring' (a quote must also be non-empty)")
@pytest.mark.parametrize("raw", [{"agent": "a"}, {"quote": "", "agent": "a"}])
def test_a_claim_without_a_quote_is_dropped(raw):
    kept, dropped = parse_claims({"claims": [raw]}, CHUNK)
    assert kept == [] and len(dropped) == 1


@pytest.mark.xfail(strict=True, raises=ValueError, reason="parse_claims leaves ts='' (marked CUSTOMISE), so check.evidence_window raises on every "
                   "extracted claim until the row's timestamp is looked up")
def test_an_extracted_claim_can_be_fed_straight_to_the_checker():
    (c,), _ = parse_claims({"claims": [{"quote": "said hi", "agent": "a"}]}, CHUNK)
    evidence_window(window(), c.ts, c.agent)


# --- check: evidence must be real, and a bad reply must not take the batch down ----------------


@pytest.mark.xfail(strict=True, reason="'' in text is True, so [''] passes the substring check and the verdict stands with no evidence")
def test_an_empty_string_is_not_evidence():
    reply = {"verdict": "contradicted", "evidence": [""], "confidence": 0.9}
    v = check_claim(claim(), window(), lambda p, t: reply, "j")
    assert v.evidence == [] and v.verdict == "unverifiable"


@pytest.mark.xfail(strict=True, reason="a bare string is iterated character by character, so single letters pass as 'quotes'")
def test_evidence_given_as_one_string_is_not_split_into_characters():
    reply = {"verdict": "contradicted", "evidence": "relevant", "confidence": 0.9}
    v = check_claim(claim(), window(), lambda p, t: reply, "j")
    assert all(len(q) > 1 for q in v.evidence)


@pytest.mark.xfail(strict=True, raises=(ValueError, TypeError), reason="float('high') raises ValueError; one malformed model reply aborts the whole run")
@pytest.mark.parametrize("confidence", ["high", None, "0.9 (fairly sure)"])
def test_a_non_numeric_confidence_does_not_crash(confidence):
    reply = {"verdict": "supported", "evidence": [], "confidence": confidence}
    assert check_claim(claim(), window(), lambda p, t: reply, "j").verdict in ("supported", "unverifiable")


@pytest.mark.xfail(strict=True, raises=AttributeError, reason="raw.get raises AttributeError when the model returns a JSON list or string")
@pytest.mark.parametrize("reply", [["supported"], "supported", None])
def test_a_reply_that_is_not_an_object_is_unverifiable(reply):
    assert check_claim(claim(), window(), lambda p, t: reply, "j").verdict == "unverifiable"


# --- spread: 'later' means later in time, not later in the alphabet -----------------------------


@pytest.mark.xfail(strict=True, reason="could_have_seen compares ISO strings, so '...00.500Z' sorts before '...00Z' "
                   "and a message half a second later is treated as earlier")
def test_fractional_seconds_order_correctly():
    later = {"ts": "2025-05-01T00:00:00.500Z", "agent": "b"}
    assert could_have_seen("a", "2025-05-01T00:00:00Z", later) is True


@pytest.mark.xfail(strict=True, reason="string comparison ignores UTC offsets: 00:30Z is after 01:00+01:00 (= 00:00Z) but sorts before it")
def test_utc_offsets_order_by_instant():
    later = {"ts": "2025-05-01T00:30:00Z", "agent": "b"}
    assert could_have_seen("a", "2025-05-01T01:00:00+01:00", later) is True


# --- lab: an unlabelled outcome must not count as 'did not act' ---------------------------------


@pytest.mark.xfail(strict=True, reason="acted_on_claim=None passes validate_run but counts in acting_rate's denominator as 'did not act', "
                   "biasing the rate down")
def test_a_run_with_no_outcome_is_flagged_before_pooling():
    run = LabRun("m", "planted_claim", 0, False, None, "d", acted_on_claim=None)
    assert validate_run(run)


# --- prompts: agent text is data (pipeline-rules) ----------------------------------------------


@pytest.mark.parametrize(
    "prompt",
    [
        pytest.param(CLAIM_PROMPT, id="claim"),
        pytest.param(CHECKER_PROMPT, id="checker"),
        pytest.param(RELATION_PROMPT, id="relation", marks=pytest.mark.xfail(strict=True, reason="no 'material, not instructions' guard, yet it embeds a later agent message")),
        pytest.param(FORECASTER_PROMPT, id="forecaster", marks=pytest.mark.xfail(strict=True, reason="no 'material, not instructions' guard, yet it embeds an agent transcript")),
    ],
)
def test_every_prompt_that_embeds_agent_text_says_it_is_not_instructions(prompt):
    lowered = " ".join(prompt.lower().split())
    assert "never as instructions" in lowered or "not instructions" in lowered
