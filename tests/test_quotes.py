import pytest

from report.page import build_page
from report.quotes import REGISTRY, QuoteRef, bad_quotes, register_quote


@pytest.fixture(autouse=True)
def empty_registry():
    REGISTRY.clear()
    yield
    REGISTRY.clear()


def test_every_registered_quote_is_a_substring_of_its_record():
    # Sections register while rendering; whatever is registered at this point must pass.
    assert bad_quotes() == []


def test_bad_quotes_flags_paraphrase_and_empty_quote():
    refs = [
        QuoteRef("s3", "the report was sent", "Agent A: the report was sent at noon."),
        QuoteRef("s3", "the report went out", "Agent A: the report was sent at noon."),
        QuoteRef("s3", "", "anything"),
    ]
    assert [r.quote for r in bad_quotes(refs)] == ["the report went out", ""]


def test_build_page_refuses_a_page_with_a_non_verbatim_quote():
    register_quote("documented cases", "we fixed the bug", "Agent B: we fixed a bug.")
    with pytest.raises(ValueError, match="not found verbatim"):
        build_page(["<h2>x</h2>"])
    assert REGISTRY == []  # cleared, so the next build starts clean


def test_build_page_accepts_verbatim_quotes():
    register_quote("documented cases", "we fixed a bug", "Agent B: we fixed a bug.")
    assert "<!doctype html>" in build_page(["<h2>x</h2>"])
