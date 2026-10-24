"""Build the results page from one JSON bundle (MVP M12).

    PYTHONPATH=src uv run python -m report.build page_data.json site/index.html

The bundle holds each stage's output. Every key is optional: a section whose data is missing becomes a "Not
available" box that says what it needs, so a missing result is never mistaken for a null one.

    {
      "title": "...",                  # optional
      "mock": false,                   # true puts a banner on the page: the numbers were made up to test it
      "records": [{"claim_id", "model", "ts", "verdict", "extractor", "judge"}, ...],       # sections 1 and 2
      "spread": {"shares": {verdict: share}, "baseline": {verdict: share},
                 "intervals": {relation: {verdict: {"k", "n", "share", "low", "high"}}},
                 "cases": [{"claim", "who_said_it", "who_repeated", "who_corrected", "duration"}, ...]},   # 3
      "validation": {"table": [{"measure", "value", "n", "note"}, ...]},                    # section 4
      "decision": {"comparison": {"curves": {name: [{"share_reviewed", "share_caught", ...}, ...]}}},   # 5
      "sandbox": {"handling": {...}, "forecaster": {...}, "predictions": [{"probability", "outcome"}, ...]}  # 6
    }

`records` are turned into the headline by `report.headline.headline`, so the charts and tables always agree.
JSON has no NaN, so a null in the decision curves is read back as NaN.
"""
import json
import sys
from pathlib import Path

from report.headline import headline
from report.page import (
    build_page,
    section_1_headline,
    section_2_by_model_month,
    section_3_spread,
    section_4_validation,
    section_5_decision_curve,
    section_6_sandbox,
    unavailable_section,
    write_page,
)

MOCK_BANNER = "MOCK DATA. These numbers were made up to test the page. None of them is a result about the AI Village."

NEEDS = {
    1: ("1. Headline", "records", "verdict records from the check stage"),
    2: ("2. By model and month", "records", "verdict records from the check stage"),
    3: ("3. Spread", "spread", "shares, baseline and cases from the spread stage"),
    4: ("4. Checker validation", "validation", "the validation table"),
    5: ("5. Decision curve", "decision", "the ranked-claims comparison"),
    6: ("6. Sandbox: forecaster and handling", "sandbox", "handling, forecaster score and predictions from the sandbox runs"),
}


def _nan_back(value):
    """JSON null becomes NaN again, inside the decision curves, where NaN means "no false claims to catch"."""
    if value is None:
        return float("nan")
    if isinstance(value, dict):
        return {k: _nan_back(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_nan_back(v) for v in value]
    return value


def _need(section: str, mapping: dict, *keys: str) -> None:
    missing = [k for k in keys if k not in mapping]
    if missing:
        raise ValueError(f"bundle section {section!r} is missing {', '.join(missing)}")


def status(bundle: dict) -> dict[int, bool]:
    """Which of the six sections have data in this bundle."""
    return {number: bool(bundle.get(key)) for number, (_, key, _) in NEEDS.items()}


def render(bundle: dict) -> str:
    """The whole page for one bundle, as HTML text."""
    present = status(bundle)
    sections: list[str] = []
    if present[1]:
        data = headline(bundle["records"])
        sections += [section_1_headline(data), section_2_by_model_month(data)]
    else:
        sections += [unavailable_section(NEEDS[n][0], f"needs {NEEDS[n][2]}.") for n in (1, 2)]

    if present[3]:
        spread = bundle["spread"]
        _need("spread", spread, "shares")
        sections.append(section_3_spread(spread["shares"], spread.get("cases", []), spread.get("baseline", {}), spread.get("intervals")))
    else:
        sections.append(unavailable_section(NEEDS[3][0], f"needs {NEEDS[3][2]}."))

    if present[4]:
        _need("validation", bundle["validation"], "table")
        sections.append(section_4_validation({}, bundle["validation"]["table"]))
    else:
        sections.append(unavailable_section(NEEDS[4][0], f"needs {NEEDS[4][2]}."))

    if present[5]:
        _need("decision", bundle["decision"], "comparison")
        sections.append(section_5_decision_curve([], _nan_back(bundle["decision"]["comparison"])))
    else:
        sections.append(unavailable_section(NEEDS[5][0], f"needs {NEEDS[5][2]}."))

    if present[6]:
        sandbox = bundle["sandbox"]
        _need("sandbox", sandbox, "handling", "forecaster")
        sections.append(section_6_sandbox(sandbox["handling"], sandbox["forecaster"], sandbox.get("predictions")))
    else:
        sections.append(unavailable_section(NEEDS[6][0], f"needs {NEEDS[6][2]}."))

    banner = bundle.get("banner") or (MOCK_BANNER if bundle.get("mock") else None)
    return build_page(sections, bundle.get("title", "claim-spread: results"), banner=banner)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__.split("\n\n")[0], file=sys.stderr)
        return 2
    source, target = Path(argv[0]), Path(argv[1])
    try:
        bundle = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, ValueError) as problem:
        print(f"cannot read {source}: {problem}", file=sys.stderr)
        return 2
    present = status(bundle)
    try:
        page = render(bundle)
    except ValueError as problem:
        print(f"cannot build the page: {problem}", file=sys.stderr)
        return 1
    write_page(page, target)
    shown = [str(n) for n, ok in present.items() if ok]
    missing = [str(n) for n, ok in present.items() if not ok]
    print(f"wrote {target}: sections with data {', '.join(shown) or 'none'}; not available {', '.join(missing) or 'none'}" + ("; MOCK banner on" if bundle.get("mock") else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
