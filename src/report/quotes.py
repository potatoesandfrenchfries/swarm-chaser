"""Quote registry for the results page (MVP.md M12, success criterion: every quote is an exact
substring of the record).

Any section that shows a quote calls `register_quote(section, quote, record)` while rendering,
where `record` is the full text the quote came from (chunk, evidence window or transcript).
`report.page.build_page` refuses to build if any registered quote fails, and
`tests/test_quotes.py` runs the same check.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class QuoteRef:
    section: str
    quote: str
    record: str


REGISTRY: list[QuoteRef] = []


def register_quote(section: str, quote: str, record: str) -> str:
    """Record a quote shown on the page and return it, so a section can register inline."""
    REGISTRY.append(QuoteRef(section, quote, record))
    return quote


def bad_quotes(refs: list[QuoteRef] | None = None) -> list[QuoteRef]:
    """Every registered quote that is empty or not an exact substring of its record."""
    return [r for r in (REGISTRY if refs is None else refs) if not r.quote or r.quote not in r.record]
