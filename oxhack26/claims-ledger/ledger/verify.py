"""Keep a quote only if it appears word for word on the page it is attributed to.

Candidates come from data/candidates.json (quotes you picked by hand) and from
what refresh pulled automatically. Each page is fetched once more here and the
quote must be an exact substring of its text, ignoring only typography and
whitespace. Everything that fails is dropped and reported, with the reason.
"""
import hashlib
import json

from .fetch import fetch
from .paths import Paths
from .text import norm, page_text, verbatim


def claim_id(owner: str, text: str) -> str:
    """Stable across runs, so a claim keeps its id when others come and go."""
    return "c-" + hashlib.sha1(f"{owner}|{norm(text)}".encode()).hexdigest()[:8]


def load_candidates(paths: Paths) -> list[dict]:
    chosen = json.loads(paths.candidates.read_text()) if paths.candidates.exists() else []
    seen = {norm(c["text"]) for c in chosen}
    auto = json.loads(paths.candidates_auto.read_text()) if paths.candidates_auto.exists() else []
    return chosen + [c for c in auto if norm(c["text"]) not in seen]


def verify(paths: Paths) -> tuple[list[dict], list[dict]]:
    pages: dict[str, str | Exception] = {}
    kept: list[dict] = []
    dropped: list[dict] = []

    for c in load_candidates(paths):
        url = c["url"]
        if url not in pages:
            try:
                pages[url] = page_text(fetch(url, paths.root))
            except Exception as error:
                pages[url] = error
        page = pages[url]
        if isinstance(page, Exception):
            dropped.append({"owner": c["owner"], "text": c["text"], "url": url, "why": f"page could not be downloaded: {page}"})
        elif not verbatim(c["text"], page):
            dropped.append({"owner": c["owner"], "text": c["text"], "url": url, "why": "quote is not a word for word substring of the page text"})
        else:
            kept.append({
                "id": claim_id(c["owner"], c["text"]),
                "owner": c["owner"], "text": c["text"], "source_url": url,
                "source_kind": c.get("source_kind", "page"),
                "claim_type": c.get("claim_type", "other"), "basis": c.get("basis", "unspecified"),
                "target_year": c.get("target_year"),
            })

    kept.sort(key=lambda c: (c["owner"], c["id"]))
    paths.out.mkdir(parents=True, exist_ok=True)
    paths.claims.write_text(json.dumps(kept, indent=1))
    paths.dropped.write_text(json.dumps(dropped, indent=1))
    return kept, dropped
