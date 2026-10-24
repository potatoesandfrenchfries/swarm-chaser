"""Fetch a page. An http(s) URL goes over the network; anything else is a local file
path (relative to the project root), which keeps the demo and the tests offline."""
import os
import urllib.request
from pathlib import Path

# Identify yourself: sites and some APIs (SEC EDGAR, for one) block anonymous scrapers.
# Set LEDGER_CONTACT="Your Name you@example.com".
USER_AGENT = "claims-ledger/0.1 (+{contact})"


def fetch(url: str, root: Path, timeout: int = 40) -> str:
    if url.startswith(("http://", "https://")):
        contact = os.environ.get("LEDGER_CONTACT", "no contact set")
        request = urllib.request.Request(
            url, headers={"User-Agent": USER_AGENT.format(contact=contact), "Accept-Language": "en-US"}
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, "replace")
    path = Path(url.removeprefix("file://"))
    return (path if path.is_absolute() else root / path).read_text(encoding="utf-8", errors="replace")
