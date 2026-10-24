"""Inline SVG charts for the results page: no script, and `currentColor` so they follow the page's text colour."""
import html


def dot_whisker_svg(rows: list[tuple], title: str, chart_id: str, width: int = 420) -> str:
    """One row per (label, share, low, high, n): the dot at the share, the whisker across its interval, n at the
    right. Shares run 0 to 1. `chart_id` must be unique on the page, because the chart's title is found by id.
    """
    left, right, row_h, top = 190, 50, 22, 24
    height = top + row_h * len(rows) + 30
    plot_w = width - left - right

    def x(share):
        return left + share * plot_w

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" style="max-width:100%;height:auto" role="img" aria-labelledby="{chart_id}">',
        f'<title id="{chart_id}">{html.escape(title)}</title>',
    ]
    for share in (0.0, 0.5, 1.0):
        parts.append(f'<line x1="{x(share):.1f}" y1="{top - 8}" x2="{x(share):.1f}" y2="{height - 26}" stroke="currentColor" stroke-opacity="0.25"/>')
        parts.append(f'<text x="{x(share):.1f}" y="{height - 12}" text-anchor="middle" font-size="10" fill="currentColor">{share:.0%}</text>')
    for i, (label, share, low, high, n) in enumerate(rows):
        y = top + row_h * i + row_h / 2
        parts.append(f'<text x="{left - 8}" y="{y + 4:.1f}" text-anchor="end" font-size="11" fill="currentColor">{html.escape(str(label))}</text>')
        parts.append(f'<line x1="{x(low):.1f}" y1="{y:.1f}" x2="{x(high):.1f}" y2="{y:.1f}" stroke="currentColor" stroke-width="2"/>')
        parts.append(f'<circle cx="{x(share):.1f}" cy="{y:.1f}" r="4" fill="currentColor"/>')
        parts.append(f'<text x="{width - right + 6}" y="{y + 4:.1f}" font-size="10" fill="currentColor">n={n}</text>')
    parts.append("</svg>")
    return "".join(parts)


VERDICT_ROWS = ("contradicted", "supported", "unverifiable")


def headline_svg(overall: dict, per_setting: dict, chart_id: str = "headline-title", width: int = 460) -> str:
    """The three verdict shares as one chart: for each, the overall share with its 95% interval, and one ring for
    every (extraction prompt, checker) setting. `overall` is `shares()` output and `per_setting` is the
    `sensitivity()["per_setting"]` dict. How far the rings sit from the dot is how much the answer depends on the
    pipeline; if they spread wider than the interval, the number is not one number. Empty if nothing was checked.
    """
    if not overall["n"]:
        return ""
    left, right, row_h, top = 110, 56, 32, 22
    height = top + row_h * len(VERDICT_ROWS) + 58
    plot_w = width - left - right

    def x(share):
        return left + share * plot_w

    title = "Share of checked claims by verdict, with 95% intervals and each prompt and checker setting"
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" style="max-width:100%;height:auto" role="img" aria-labelledby="{chart_id}">',
        f'<title id="{chart_id}">{html.escape(title)}</title>',
    ]
    for share in (0.0, 0.5, 1.0):
        parts.append(f'<line x1="{x(share):.1f}" y1="{top - 8}" x2="{x(share):.1f}" y2="{top + row_h * len(VERDICT_ROWS)}" stroke="currentColor" stroke-opacity="0.25"/>')
        parts.append(f'<text x="{x(share):.1f}" y="{top + row_h * len(VERDICT_ROWS) + 13}" text-anchor="middle" font-size="10" fill="currentColor">{share:.0%}</text>')
    for i, verdict in enumerate(VERDICT_ROWS):
        y = top + row_h * i + row_h / 2
        s = overall[verdict]
        parts.append(f'<text x="{left - 8}" y="{y + 4:.1f}" text-anchor="end" font-size="11" fill="currentColor">{verdict}</text>')
        parts.append(f'<line x1="{x(s["low"]):.1f}" y1="{y:.1f}" x2="{x(s["high"]):.1f}" y2="{y:.1f}" stroke="currentColor" stroke-width="2"/>')
        for setting in per_setting.values():
            if setting["n"]:
                parts.append(f'<circle cx="{x(setting[verdict]["p"]):.1f}" cy="{y:.1f}" r="5.5" fill="none" stroke="currentColor" stroke-opacity="0.7" stroke-width="1.5"/>')
        parts.append(f'<circle cx="{x(s["p"]):.1f}" cy="{y:.1f}" r="3.5" fill="currentColor"/>')
        parts.append(f'<text x="{width - right + 6}" y="{y + 4:.1f}" font-size="10" fill="currentColor">{s["k"]}/{overall["n"]}</text>')
    parts.append(f'<text x="8" y="{height - 22}" font-size="10" fill="currentColor">dot and line: the overall share with its 95% interval</text>')
    parts.append(f'<text x="8" y="{height - 8}" font-size="10" fill="currentColor">ring: the share from one extraction prompt and checker</text>')
    parts.append("</svg>")
    return "".join(parts)


def grid_svg(models: list, months: list, cells: dict, chart_id: str = "model-month-title", cell_w: int = 74, row_h: int = 26) -> str:
    """Claims checked per model and month, as a grid. `cells` maps (model, month) to (n, contradicted_share or
    None); a missing key or n of 0 is an empty cell. This is the confound made visible: a model that ran in
    different months from another cannot be compared with it, whatever the by-model chart seems to say.
    """
    if not models or not months:
        return ""
    left, top = 210, 34
    width, height = max(left + cell_w * len(months) + 8, 400), top + row_h * len(models) + 30
    most = max((cells.get((m, mo), (0, None))[0] for m in models for mo in months), default=0) or 1
    title = "Claims checked per model and month, with the share contradicted"
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" style="max-width:100%;height:auto" role="img" aria-labelledby="{chart_id}">',
        f'<title id="{chart_id}">{html.escape(title)}</title>',
    ]
    for j, month in enumerate(months):
        parts.append(f'<text x="{left + cell_w * j + cell_w / 2:.1f}" y="{top - 10}" text-anchor="middle" font-size="11" fill="currentColor">{html.escape(str(month))}</text>')
    for i, model in enumerate(models):
        y = top + row_h * i
        parts.append(f'<text x="{left - 8}" y="{y + row_h / 2 + 4:.1f}" text-anchor="end" font-size="11" fill="currentColor">{html.escape(str(model))}</text>')
        for j, month in enumerate(months):
            n, share = cells.get((model, month), (0, None))
            x0 = left + cell_w * j
            opacity = 0.08 + 0.5 * n / most if n else 0.0
            parts.append(f'<rect x="{x0 + 1}" y="{y + 1}" width="{cell_w - 2}" height="{row_h - 2}" fill="currentColor" fill-opacity="{opacity:.2f}" stroke="currentColor" stroke-opacity="0.25"/>')
            label = f"{n} · {share:.0%}" if n and share is not None else (str(n) if n else "–")
            parts.append(f'<text x="{x0 + cell_w / 2:.1f}" y="{y + row_h / 2 + 4:.1f}" text-anchor="middle" font-size="10" fill="currentColor">{label}</text>')
    parts.append(f'<text x="8" y="{height - 8}" font-size="10" fill="currentColor">each cell: claims checked · share contradicted. A dash means none.</text>')
    parts.append("</svg>")
    return "".join(parts)


def calibration_svg(bins: list, chart_id: str = "calibration-title", size: int = 280) -> str:
    """A reliability chart: for each bin of predicted probability, the share that really happened. `bins` is a
    list of (mean_predicted, observed_rate, n). A forecaster that is calibrated sits on the diagonal; the dot's
    size is the bin's n, so a far-off bin with two runs in it is not mistaken for a finding. Empty if no bins.
    """
    if not bins:
        return ""
    pad = 44
    plot = size - 2 * pad
    most = max(n for _, _, n in bins) or 1

    def xy(px, py):
        return pad + px * plot, size - pad - py * plot

    title = "Forecaster calibration: predicted probability against how often the agent acted"
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}" style="max-width:100%;height:auto" role="img" aria-labelledby="{chart_id}">',
        f'<title id="{chart_id}">{html.escape(title)}</title>',
        f'<rect x="{pad}" y="{pad}" width="{plot}" height="{plot}" fill="none" stroke="currentColor" stroke-opacity="0.25"/>',
    ]
    x0, y0 = xy(0, 0)
    x1, y1 = xy(1, 1)
    parts.append(f'<line x1="{x0:.1f}" y1="{y0:.1f}" x2="{x1:.1f}" y2="{y1:.1f}" stroke="currentColor" stroke-opacity="0.5" stroke-dasharray="4 3"/>')
    for t in (0.0, 0.5, 1.0):
        tx, _ = xy(t, 0)
        _, ty = xy(0, t)
        parts.append(f'<text x="{tx:.1f}" y="{size - pad + 14}" text-anchor="middle" font-size="10" fill="currentColor">{t:.0%}</text>')
        parts.append(f'<text x="{pad - 6}" y="{ty + 3:.1f}" text-anchor="end" font-size="10" fill="currentColor">{t:.0%}</text>')
    for predicted, observed, n in bins:
        cx, cy = xy(predicted, observed)
        r = 3 + 6 * (n / most) ** 0.5
        parts.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="currentColor" fill-opacity="0.55" stroke="currentColor"><title>{n} runs: predicted {predicted:.0%}, acted {observed:.0%}</title></circle>')
    parts.append(f'<text x="{size / 2:.1f}" y="{size - 8}" text-anchor="middle" font-size="10" fill="currentColor">predicted probability</text>')
    parts.append(f'<text x="12" y="{size / 2:.1f}" text-anchor="middle" font-size="10" fill="currentColor" transform="rotate(-90 12 {size / 2:.1f})">acted (observed)</text>')
    parts.append("</svg>")
    return "".join(parts)
