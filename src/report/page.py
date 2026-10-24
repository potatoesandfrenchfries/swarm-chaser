"""Build the single static results page (scope.md section 5 `report/`; MVP.md M12).

Combines every other stage's output into one page with the six items under MVP.md's "Goal"
section, plus the limits of the study. This module only assembles already-computed data into
HTML; it runs no model calls and fits no parameters, so it has no dependency on the no-training
clause the rest of the pipeline is careful about.

CUSTOMISE: this writes a minimal, static page (one <table> per section, no JS). scope.md
section 4 flags `temps_ideas/repos/swarm-tracer`'s React+D3 viewer as an option "if time
allows" — reuse this module's `page_sections()` as the data to feed that instead, if you build
it, rather than duplicating the assembly logic in two places.
"""
import html
from pathlib import Path

LIMITS_NOTE = (
    "All verdicts on this page come from LLM checkers, not human review. The perturbation "
    "test, cross-vendor agreement and known-failure recall estimate how often the checker is "
    "sensitive and consistent, but none of them gives a false-positive rate against real "
    "ground truth: a claim wrongly called false here was never checked by a person. The "
    "headline shares move with which extraction prompt and checker vendor ran, shown as a "
    "range rather than one point. Models ran in different periods of the Village, so model "
    "and time are confounded in the breakdown by model."
)


def _table(headers: list[str], rows: list[list]) -> str:
    head = "".join(f"<th>{html.escape(str(h))}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td>{html.escape(str(c))}</td>" for c in row) + "</tr>" for row in rows)
    return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"


def _shares_table(shares_by_group: dict) -> str:
    """Render a `breakdown()`-shaped dict (report.headline) as one table, one row per group."""
    rows = []
    for group, s in shares_by_group.items():
        rows.append(
            [
                group,
                s["n"],
                *[f"{s[v]['p']:.0%} [{s[v]['low']:.0%}, {s[v]['high']:.0%}]" for v in ("contradicted", "supported", "unverifiable")],
            ]
        )
    return _table(["Group", "n", "Contradicted", "Supported", "Unverifiable"], rows)


def section_1_headline(headline_data: dict) -> str:
    """MVP.md Goal item 1: headline shares with intervals and the prompt/vendor range."""
    overall = _shares_table({"overall": headline_data["overall"]})
    rng = headline_data["sensitivity"]["range"]
    range_text = "; ".join(f"{v}: {rng[v]['min']:.0%}–{rng[v]['max']:.0%}" for v in rng)
    return f"<h2>1. Headline</h2>{overall}<p>Range across extraction prompts and checker vendors: {html.escape(range_text)}</p>"


def section_2_by_model_month(headline_data: dict) -> str:
    """MVP.md Goal item 2: false-claim rate by model and by month."""
    return (
        "<h2>2. By model and month</h2>"
        "<p>Models ran in different periods, so model and time are confounded (MVP.md M5).</p>"
        f"<h3>By model</h3>{_shares_table(headline_data['by_model'])}"
        f"<h3>By month</h3>{_shares_table(headline_data['by_month'])}"
    )


def section_3_spread(spread_shares: dict, documented_cases: list[dict], baseline_shares: dict) -> str:
    """MVP.md Goal item 3: spread result plus documented cases, against the string-match baseline.
    CUSTOMISE: `documented_cases` is a list of {claim, who_said_it, who_repeated, who_corrected,
    duration} dicts you fill in by hand from the three cases M7 asks for — picking and writing
    those up is a manual, read-the-transcript step with no code to template.
    """
    cases_rows = [[c.get(k, "") for k in ("claim", "who_said_it", "who_repeated", "who_corrected", "duration")] for c in documented_cases]
    cases_table = _table(["Claim", "Who said it", "Who repeated", "Who corrected", "Duration"], cases_rows)
    compare_rows = [[v, f"{spread_shares.get(v, float('nan')):.0%}", f"{baseline_shares.get(v, float('nan')):.0%}"] for v in spread_shares]
    return (
        "<h2>3. Spread</h2>"
        f"{_table(['Verdict', 'Model-linker repeated/corrected share', 'String-match baseline'], compare_rows)}"
        f"<h3>Documented cases</h3>{cases_table}"
    )


def section_4_validation(validation_report: dict) -> str:
    """MVP.md Goal item 4: perturbation test, cross-vendor agreement, known-failure recall,
    spot-check. CUSTOMISE: `validation_report` should merge the dicts from
    `eval.validation.perturbation_test`, `agreement_report` and `known_failure_recall`, plus a
    hand-written spot-check note (d), which has no function of its own.
    """
    rows = [[k, v] for k, v in validation_report.items() if k != "spot_check_note"]
    note = validation_report.get("spot_check_note", "CUSTOMISE: fill in after reading ~20 outputs by hand.")
    return f"<h2>4. Checker validation</h2>{_table(['Measure', 'Value'], rows)}<p>Spot-check: {html.escape(note)}</p>"


def section_5_decision_curve(curve_points: list[dict]) -> str:
    """MVP.md Goal item 5. CUSTOMISE: a real page should plot this (e.g. a small inline SVG
    via the artifact-diagramming skill, or a sparkline); this renders the raw points as a
    table so the page has no JS dependency by default.
    """
    rows = [[p["claims_reviewed"], p["false_claims_caught"], f"{p['share_reviewed']:.0%}", f"{p['share_caught']:.0%}"] for p in curve_points]
    return f"<h2>5. Decision curve</h2>{_table(['Reviewed', 'False caught', 'Share reviewed', 'Share caught'], rows)}"


def section_6_sandbox(handling: dict, forecaster_score: dict) -> str:
    """MVP.md Goal item 6: forecaster accuracy and the handling result, in the sandbox."""
    w = handling["without_intervention"]
    rows = [["No intervention", w["n"], f"{w['rate']:.0%}" if w["n"] else "n/a"]]
    for strategy, s in handling["with_intervention"].items():
        rows.append([f"With intervention ({strategy})", s["n"], f"{s['rate']:.0%}" if s["n"] else "n/a"])
    forecaster_rows = [[k, v] for k, v in forecaster_score.items()]
    return (
        "<h2>6. Sandbox: forecaster and handling</h2>"
        f"<h3>Acting rate</h3>{_table(['Arm', 'n', 'Rate'], rows)}"
        f"<h3>Forecaster</h3>{_table(['Metric', 'Value'], forecaster_rows)}"
    )


def build_page(sections: list[str], title: str = "claim-spread: results") -> str:
    """Wrap pre-rendered section HTML into one static page. CUSTOMISE styling as wanted;
    kept to inline CSS and no JS so `python -m http.server` is enough to view it.
    """
    body = "\n".join(sections) + f"<h2>Limits</h2><p>{html.escape(LIMITS_NOTE)}</p>"
    return (
        f"<!doctype html><html><head><meta charset='utf-8'><title>{html.escape(title)}</title>"
        "<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto}"
        "table{border-collapse:collapse;margin:0.5rem 0}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}</style>"
        f"</head><body><h1>{html.escape(title)}</h1>{body}</body></html>"
    )


def write_page(html_text: str, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html_text, encoding="utf-8")
