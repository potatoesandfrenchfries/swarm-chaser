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

from report.charts import calibration_svg, dot_whisker_svg, grid_svg, headline_svg
from report.quotes import REGISTRY, bad_quotes, register_quote

LIMITS_NOTE = (
    "All verdicts on this page come from LLM checkers, not human review. The perturbation "
    "test, cross-vendor agreement and known-failure recall estimate how often the checker is "
    "sensitive and consistent, but none of them gives a false-positive rate against real "
    "ground truth: a claim wrongly called false here was never checked by a person. The "
    "headline shares move with which extraction prompt and checker vendor ran, shown as a "
    "range rather than one point. Models ran in different periods of the Village, so model "
    "and time are confounded in the breakdown by model."
)

# What the page does not show (MVP.md M12, "the limits of the study"). Keep each item short
# and true of the run actually shown; add to it rather than soften it.
LIMITS = [
    "All labels are LLM-made. No claim, verdict, spread link or sandbox outcome was checked by a person, so no number here is accuracy against human-labelled truth.",
    "Model and time are confounded: each model ran in a different period of the Village, so a difference by model may be a difference by month.",
    "The village results cover one slice of the record, not the full 17 months, and only claims that a checker could test against the same agent's own record.",
    "Spread counts only repeats and corrections the linker found among agents who could have seen the earlier message; links it missed are not counted.",
    "The sandbox is one scenario with two models. Its forecaster and handling results say nothing about other tasks, models or influencer strategies than the ones listed.",
    "The forecaster is zero-shot and compared against a base-rate predictor only, not against other forecasters or people. Its outcome labels come from the definition of acting on the claim that was frozen before the main runs.",
]


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
    chart = headline_svg(headline_data["overall"], headline_data["sensitivity"]["per_setting"])
    return f"<h2>1. Headline</h2>{chart}{overall}<p>Range across extraction prompts and checker vendors: {html.escape(range_text)}</p>"


def _contradicted_chart(shares_by_group: dict, by: str) -> str:
    """The contradicted share of each group in a `breakdown()`-shaped dict, as a dot-and-whisker chart.
    A group with no claims has no share to plot, so it is left out of the chart and stays in the table.
    """
    rows = [(group, s["contradicted"]["p"], s["contradicted"]["low"], s["contradicted"]["high"], s["n"]) for group, s in shares_by_group.items() if s["n"]]
    return dot_whisker_svg(rows, f"Share of claims contradicted by {by}, with 95% intervals", f"contradicted-by-{by}")


def _model_month_grid(by_model_month: dict) -> str:
    """The grid chart from `headline()["by_model_month"]`: months across, models down, in sorted order."""
    models = sorted(by_model_month)
    months = sorted({month for per_month in by_model_month.values() for month in per_month})
    cells = {(m, mo): (s["n"], s["contradicted"]["p"]) for m, per_month in by_model_month.items() for mo, s in per_month.items() if s["n"]}
    return grid_svg(models, months, cells)


def section_2_by_model_month(headline_data: dict) -> str:
    """MVP.md Goal item 2: false-claim rate by model and by month."""
    grid = _model_month_grid(headline_data["by_model_month"]) if headline_data.get("by_model_month") else ""
    return (
        "<h2>2. By model and month</h2>"
        "<p>Models ran in different periods, so model and time are confounded (MVP.md M5). The grid shows which "
        "months each model has claims in; compare two models only where their rows overlap.</p>"
        f"{grid}"
        f"<h3>By model</h3>{_contradicted_chart(headline_data['by_model'], 'model')}{_shares_table(headline_data['by_model'])}"
        f"<h3>By month</h3>{_contradicted_chart(headline_data['by_month'], 'month')}{_shares_table(headline_data['by_month'])}"
    )


def section_3_spread(spread_shares: dict, documented_cases: list[dict], baseline_shares: dict, intervals: dict | None = None) -> str:
    """MVP.md Goal item 3: spread result plus documented cases, against the string-match baseline.
    `documented_cases` comes from `spread.linker.documented_case`, one per case picked by hand.
    A case carrying its source `record` has its quote registered, so `build_page` refuses to
    build if the quote is not verbatim. `intervals` maps a relation label (e.g. "repeated",
    "corrected") to `spread.linker.spread_share_intervals`; when given, the section opens with
    that chart.
    """
    from spread.linker import spread_svg

    chart = spread_svg(intervals) if intervals else ""
    for c in documented_cases:
        if "record" in c:
            register_quote("documented cases", c["claim"], c["record"])
    shortfall = f"<p>{len(documented_cases)} of the three documented cases M7 asks for.</p>" if len(documented_cases) < 3 else ""
    cases_rows = [[c.get(k, "") for k in ("claim", "who_said_it", "who_repeated", "who_corrected", "duration")] for c in documented_cases]
    cases_table = _table(["Claim", "Who said it", "Who repeated", "Who corrected", "Duration"], cases_rows)
    compare_rows = [[v, f"{spread_shares.get(v, float('nan')):.0%}", f"{baseline_shares.get(v, float('nan')):.0%}"] for v in spread_shares]
    return (
        "<h2>3. Spread</h2>"
        f"{chart}"
        f"{_table(['Verdict', 'Model-linker repeated/corrected share', 'String-match baseline'], compare_rows)}"
        f"<h3>Documented cases</h3>{shortfall}{cases_table}"
    )


def section_4_validation(validation_report: dict, table: list[dict] | None = None) -> str:
    """MVP.md Goal item 4: perturbation test, cross-vendor agreement, known-failure recall,
    spot-check. Pass `table` from `eval.validation.validation_table` to show each check with its
    value, sample size and what it does not show; `validation_report` is then unused. Without
    `table`, the raw `validation_report` dict is shown with its spot-check note.
    """
    if table is not None:
        rows = [[r["measure"], r["value"], r["n"], r["note"]] for r in table]
        return f"<h2>4. Checker validation</h2>{_table(['Check', 'Value', 'n', 'What it does not show'], rows)}"
    rows = [[k, v] for k, v in validation_report.items() if k != "spot_check_note"]
    note = validation_report.get("spot_check_note", "CUSTOMISE: fill in after reading ~20 outputs by hand.")
    return f"<h2>4. Checker validation</h2>{_table(['Measure', 'Value'], rows)}<p>Spot-check: {html.escape(note)}</p>"


def section_5_decision_curve(curve_points: list[dict], comparison: dict | None = None) -> str:
    """MVP.md Goal item 5: false claims caught against claims reviewed. `comparison` is
    `eval.decision_curve.compare_rankings`, which adds the random baseline; without it the one
    curve in `curve_points` is drawn alone. A table of the share caught at each review budget
    follows the chart, rather than one row per claim.
    """
    from eval.decision_curve import REVIEW_BUDGETS, caught_at, curve_svg

    curves = comparison["curves"] if comparison else ({"ranking": curve_points} if curve_points else {})
    if not curves:
        return "<h2>5. Decision curve</h2><p>No claims to rank.</p>"
    headers = ["Ranking"] + [f"Caught at {b:.0%} reviewed" for b in REVIEW_BUDGETS]
    rows = [[name] + [_pct(caught_at(points, b)) for b in REVIEW_BUDGETS] for name, points in curves.items()]
    return f"<h2>5. Decision curve</h2>{curve_svg(curves)}{_table(headers, rows)}"


def _pct(x: float) -> str:
    return "n/a" if x != x else f"{x:.0%}"


def _number(value):
    """A float to three decimals, and NaN or None to "n/a"; anything else as it is. Long floats are unreadable in a table."""
    if value is None or (isinstance(value, float) and value != value):
        return "n/a"
    return f"{value:.3f}" if isinstance(value, float) else value


def _acting_rate_chart(handling: dict) -> str:
    """Acting rate per arm with a Wilson interval. An arm with no runs has no rate, so it is left out of the chart."""
    from report.headline import wilson

    arms = [("No intervention", handling["without_intervention"])] + [(f"With intervention ({name})", s) for name, s in handling["with_intervention"].items()]
    rows = []
    for label, arm in arms:
        if arm["n"]:
            p, low, high = wilson(arm["k"], arm["n"])
            rows.append((label, p, low, high, arm["n"]))
    return dot_whisker_svg(rows, "Share of runs where the agent acted on the planted claim, with 95% intervals", "acting-rate-title") if rows else ""


def section_6_sandbox(handling: dict, forecaster_score: dict, predictions: list[dict] | None = None) -> str:
    """MVP.md Goal item 6: forecaster accuracy and the handling result, in the sandbox. `predictions`, a list of
    {"probability", "outcome"}, adds the calibration chart; without it the section shows the metrics alone."""
    from eval.forecaster import Prediction, calibration_bins

    w = handling["without_intervention"]
    rows = [["No intervention", w["n"], f"{w['rate']:.0%}" if w["n"] else "n/a"]]
    for strategy, s in handling["with_intervention"].items():
        rows.append([f"With intervention ({strategy})", s["n"], f"{s['rate']:.0%}" if s["n"] else "n/a"])
    forecaster_rows = [[k, _number(v)] for k, v in forecaster_score.items()]
    calibration = calibration_svg(calibration_bins([Prediction(str(i), p["probability"], bool(p["outcome"])) for i, p in enumerate(predictions)])) if predictions else ""
    return (
        "<h2>6. Sandbox: forecaster and handling</h2>"
        f"<h3>Acting rate</h3>{_acting_rate_chart(handling)}{_table(['Arm', 'n', 'Rate'], rows)}"
        f"<h3>Forecaster</h3>{calibration}{_table(['Metric', 'Value'], forecaster_rows)}"
    )


def unavailable_section(heading: str, reason: str) -> str:
    """A section whose data does not exist yet. The page shows the gap and says why, so a missing result is not
    mistaken for a null one."""
    return f"<h2>{html.escape(heading)}</h2><p class='gap'><strong>Not available.</strong> {html.escape(reason)}</p>"


def section_limits() -> str:
    """MVP.md M12: what the page does not show."""
    items = "".join(f"<li>{html.escape(item)}</li>" for item in LIMITS)
    return f"<h2>Limits</h2><p>{html.escape(LIMITS_NOTE)}</p><p>What this page does not show:</p><ul>{items}</ul>"


def build_page(sections: list[str], title: str = "claim-spread: results", banner: str | None = None) -> str:
    """Wrap pre-rendered section HTML into one static page. Inline CSS, no JS, so `python -m http.server` is enough
    to view it, and colours follow the reader's light or dark setting. `banner`, if given, is shown above the
    title in a box that cannot be missed (used to mark a page built from mock data).

    Raises ValueError if any quote a section registered is not an exact substring of its
    record (MVP.md success criterion: 100%), then clears the registry for the next build.
    """
    bad = bad_quotes()
    REGISTRY.clear()
    if bad:
        listed = "; ".join(f"{r.section}: {r.quote[:60]!r}" for r in bad)
        raise ValueError(f"{len(bad)} quote(s) not found verbatim in their record: {listed}")
    body = "\n".join(sections) + section_limits()
    banner_html = f"<div class='banner' role='note'>{html.escape(banner)}</div>" if banner else ""
    return (
        f"<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>"
        f"<title>{html.escape(title)}</title>"
        "<style>:root{color-scheme:light dark;--rule:#8886}"
        "body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 16px;line-height:1.45}"
        "table{border-collapse:collapse;margin:0.5rem 0;max-width:100%;display:block;overflow-x:auto}"
        "td,th{border:1px solid var(--rule);padding:4px 8px;text-align:left}"
        "svg{display:block;margin:0.5rem 0;color:inherit}"
        ".banner{border:3px solid #b45309;background:#fef3c7;color:#451a03;padding:12px 16px;margin:0 0 1.5rem;font-weight:600}"
        ".gap{border-left:4px solid var(--rule);padding-left:12px}</style>"
        f"</head><body>{banner_html}<h1>{html.escape(title)}</h1>{body}</body></html>"
    )


def write_page(html_text: str, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html_text, encoding="utf-8")
