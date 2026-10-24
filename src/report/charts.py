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
