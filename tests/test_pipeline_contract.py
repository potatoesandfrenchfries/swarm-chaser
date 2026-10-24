"""The rules in `.claude/skills/pipeline-rules` and the agreements between modules, as tests.

These fail when one stage drifts away from another (a renamed label, a prompt that no longer
returns the keys its parser reads) or when a rule from the skill is broken in src/.
"""

import ast
import re
import sys
from pathlib import Path

import pytest

import check.checker as checker
import eval.forecaster as forecaster
import extract.claims as extract
import lab.arms as arms
import report.headline as headline
import spread.linker as linker
from conftest import REPO_ROOT
from report.page import LIMITS_NOTE

SRC = REPO_ROOT / "src"
SRC_FILES = sorted(SRC.rglob("*.py"))
SRC_PACKAGES = {p.name for p in SRC.iterdir() if p.is_dir() and not p.name.startswith((".", "__"))}

# Third-party imports allowed in src/. Empty on purpose: the pipeline core is stdlib-only, so the
# offline test job needs nothing beyond pytest. Add a package here AND to the install step of the
# `test-fast` job in .github/workflows/ci.yml in the same change.
ALLOWED_THIRD_PARTY: set[str] = set()


# --- the shared vocabulary ---------------------------------------------------------------------


def test_checker_and_report_agree_on_the_verdict_labels():
    """checker.py says its VERDICTS 'must match report/headline.py'. A mismatch raises in shares()."""
    assert checker.VERDICTS == headline.VERDICTS == ("contradicted", "supported", "unverifiable")


def test_a_checker_verdict_is_always_accepted_by_the_headline():
    reply = {"verdict": "supported", "evidence": [], "confidence": 0.5}
    c = extract.Claim("c1", "e1", "a", "m", "2025-05-01T00:00:00Z", "chat", "q", "x", True)
    v = checker.check_claim(c, [], lambda p, t: reply, "j")
    record = {"claim_id": v.claim_id, "model": "m", "ts": c.ts, "verdict": v.verdict, "extractor": c.extractor, "judge": v.judge}
    assert headline.shares([record])["supported"]["k"] == 1


def test_every_prompt_names_the_labels_its_parser_accepts():
    for verdict in checker.VERDICTS:
        assert verdict in checker.CHECKER_PROMPT
    for relation in (*linker.RELATIONS, "none"):
        assert relation in linker.RELATION_PROMPT


@pytest.mark.parametrize(
    ("prompt", "keys"),
    [
        (extract.CLAIM_PROMPT, ["claims", "quote", "agent", "claim_type", "checkable"]),
        (checker.CHECKER_PROMPT, ["verdict", "evidence", "confidence"]),
        (linker.RELATION_PROMPT, ["relation"]),
        (forecaster.FORECASTER_PROMPT, ["probability"]),
    ],
    ids=["extract", "check", "link", "forecast"],
)
def test_each_prompt_asks_for_the_keys_its_parser_reads(prompt, keys):
    assert all(f'"{k}"' in prompt for k in keys)


@pytest.mark.parametrize("outcome", [forecaster.SANDBOX_OUTCOME, forecaster.VILLAGE_OUTCOME])
def test_the_one_forecaster_prompt_renders_for_both_sandbox_and_village(outcome):
    """MVP S1: the M10 prompt is reused unchanged, so it must format cleanly for both outcomes."""
    rendered = forecaster.FORECASTER_PROMPT.format(outcome_description=outcome)
    assert outcome in rendered and "{" in rendered and "{outcome_description}" not in rendered
    assert '"probability"' in rendered  # the JSON braces survived formatting


def test_claim_fields_cover_what_the_headline_records_need():
    fields = set(extract.Claim.__dataclass_fields__)
    assert {"claim_id", "model", "ts", "extractor"} <= fields


def test_the_forecaster_and_arms_share_the_same_notion_of_acting():
    """M10 predicts the same outcome M11 measures: both read the run's acted_on_claim."""
    assert "acted_on_claim" in arms.LabRun.__dataclass_fields__
    assert "act on the planted claim" in forecaster.SANDBOX_OUTCOME


def test_the_page_never_says_unverifiable_is_part_of_another_share():
    assert "unverifiable" in headline.VERDICTS
    from report.page import _shares_table

    zero = {"n": 0, **{v: {"k": 0, "p": float("nan"), "low": float("nan"), "high": float("nan")} for v in headline.VERDICTS}}
    assert "Unverifiable" in _shares_table({"g": zero})


def test_limits_note_covers_what_mvp_says_the_page_must_state():
    note = LIMITS_NOTE.lower()
    for required in ("llm", "not human review", "false-positive", "range", "confounded"):
        assert required in note


# --- rules from pipeline-rules, checked against the source ---------------------------------------


def _imports(path: Path) -> set[str]:
    found = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            found |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            found.add(node.module.split(".")[0])
    return found


def test_src_imports_only_the_standard_library_and_itself():
    offenders = {
        str(f.relative_to(REPO_ROOT)): sorted(bad)
        for f in SRC_FILES
        if (bad := _imports(f) - set(sys.stdlib_module_names) - SRC_PACKAGES - ALLOWED_THIRD_PARTY)
    }
    assert not offenders, f"third-party imports need an entry in ALLOWED_THIRD_PARTY and the CI install: {offenders}"


def test_every_src_package_is_importable_as_a_package():
    missing = [p for p in SRC_PACKAGES if not (SRC / p / "__init__.py").exists()]
    assert not missing, f"packages without __init__.py are skipped by some tools: {missing}"


def test_src_reads_no_clock_so_a_rerun_matches():
    """Rule: no run timestamps in committed files. Timestamps in src/ come from the data, never now()."""
    clock = re.compile(r"datetime\.(now|utcnow|today)|date\.today|time\.(time|ctime|strftime)|\btime\(\)|uuid\.uuid[14]")
    hits = [f"{f.relative_to(REPO_ROOT)}:{n}" for f in SRC_FILES for n, line in enumerate(f.read_text().splitlines(), 1) if clock.search(line)]
    assert not hits, hits


def test_src_never_uses_the_unseeded_global_random_generator():
    unseeded = re.compile(r"\brandom\.(random|randint|choice|choices|shuffle|sample|uniform|seed)\(")
    hits = [f"{f.relative_to(REPO_ROOT)}:{n}" for f in SRC_FILES for n, line in enumerate(f.read_text().splitlines(), 1) if unseeded.search(line)]
    assert not hits, f"use random.Random(seed) so runs reproduce: {hits}"


def test_src_fits_nothing_to_village_data():
    """Rule: no training or fitting; every score is zero-shot."""
    fitting = re.compile(r"\.(fit|fit_transform|partial_fit|train)\(|\bimport (sklearn|torch|xgboost|lightgbm)|from (sklearn|torch)")
    hits = [f"{f.relative_to(REPO_ROOT)}:{n}" for f in SRC_FILES for n, line in enumerate(f.read_text().splitlines(), 1) if fitting.search(line)]
    assert not hits, hits


def test_src_makes_no_network_or_model_calls():
    """Model clients are injected (`call_checker`, `call_relation_classifier`). Importing one into a
    stage would make the offline test run call a paid API."""
    clients = {"anthropic", "openai", "google", "httpx", "requests", "urllib", "socket", "inspect_ai", "huggingface_hub", "datasets"}
    offenders = {str(f.relative_to(REPO_ROOT)): sorted(_imports(f) & clients) for f in SRC_FILES if _imports(f) & clients}
    assert not offenders, offenders


def test_src_has_no_unfinished_markers_that_hide_a_crash():
    stubs = [f"{f.relative_to(REPO_ROOT)}:{n}" for f in SRC_FILES for n, line in enumerate(f.read_text().splitlines(), 1) if re.search(r"raise NotImplementedError|\bFIXME\b", line)]
    assert not stubs, stubs


def test_quotes_are_checked_against_the_text_they_came_from():
    """Both substring gates must use the exact-match rule, not a looser one."""
    assert extract.validate_quote("a b", "a  b") is False  # whitespace-collapsing would pass this
    assert extract.validate_quote("A", "a") is False  # case folding would pass this
    window = [{"id": "r", "agent": "a", "ts": "2025-05-01T00:00:00Z", "source": "chat", "text": "The  Build  Failed"}]
    c = extract.Claim("c", "e", "a", "", "2025-05-01T00:00:00Z", "chat", "q", "x", True)
    reply = {"verdict": "contradicted", "evidence": ["the build failed"], "confidence": 0.9}
    assert checker.check_claim(c, window, lambda p, t: reply, "j").verdict == "unverifiable"
