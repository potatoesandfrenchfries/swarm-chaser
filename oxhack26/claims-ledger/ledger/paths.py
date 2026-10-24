"""Where everything lives. A project root holds data/ (inputs), data/out/ (results) and site/."""
from pathlib import Path

PACKAGE = Path(__file__).resolve().parent
DEFAULT_ROOT = PACKAGE.parent


class Paths:
    def __init__(self, root: Path | str = DEFAULT_ROOT):
        self.root = Path(root).resolve()
        self.data = self.root / "data"
        self.out = self.data / "out"
        self.sources = self.data / "sources.json"
        self.candidates = self.data / "candidates.json"          # hand-picked quotes
        self.candidates_auto = self.out / "candidates_auto.json"  # what refresh pulled
        self.scoring = self.data / "scoring.json"
        self.records = self.data / "records.json"
        self.snapshots = self.out / "snapshots"
        self.history = self.out / "history.jsonl"
        self.claims = self.out / "claims.json"
        self.dropped = self.out / "dropped.json"
        self.receipts = self.out / "receipts.json"
        self.site_data = self.root / "site" / "data.js"
