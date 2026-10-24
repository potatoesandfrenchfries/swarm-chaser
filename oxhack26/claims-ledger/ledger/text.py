"""Turning a web page into comparable text. Refresh and verify both use these, so a
quote cut from a page by one is a word-for-word match for the other."""
import html
import re

_QUOTES = {"’": "'", "‘": "'", "“": '"', "”": '"'}
_DASHES = {"‑": "-", "–": "-", "—": "-"}
_SPACES = {" ": " ", " ": " ", " ": " ", " ": " "}


def _fold(s: str) -> str:
    """Same characters, one spelling: straight quotes, plain spaces, plain hyphens."""
    for table in (_QUOTES, _DASHES, _SPACES):
        for fancy, plain in table.items():
            s = s.replace(fancy, plain)
    return s


def norm(s: str) -> str:
    """Fold typography and collapse all whitespace. Two strings are 'the same words' if their norms match."""
    return re.sub(r"\s+", " ", _fold(s)).strip()


def page_text(raw_html: str) -> str:
    """Visible text of a page. Block-level tags become newlines so sentences do not run together."""
    raw = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1>", " ", raw_html)
    raw = re.sub(r"(?i)</(p|div|li|h\d|td|th|tr|section|article|blockquote)\s*>|<br\s*/?>", "\n", raw)
    return _fold(html.unescape(re.sub(r"(?s)<[^>]+>", " ", raw)))


def sentences(text: str, min_len: int = 40, max_len: int = 420) -> list[str]:
    """Sentences cut straight from the text, in order, without duplicates."""
    out: list[str] = []
    for block in text.split("\n"):
        block = re.sub(r"\s+", " ", block).strip()
        for s in re.split(r"(?<=[.!?])\s+(?=[A-Z\"'])", block):
            if min_len <= len(s) <= max_len and s[-1] in ".!?":
                out.append(s)
    return list(dict.fromkeys(out))


def verbatim(quote: str, page: str) -> bool:
    """Is the quote, word for word, somewhere in the page text?"""
    return norm(quote) in norm(page)
