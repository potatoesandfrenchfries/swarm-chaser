"""Pack the results into site/data.js so the viewer works from a file, with no server.

Everything in the bundle is derived from the committed outputs, with no "built at"
time, so running the pipeline again with nothing new produces a byte-identical file.
"""
import json

from .paths import Paths

HISTORY_LIMIT = 200  # most recent changes shown in the viewer


def bundle(paths: Paths) -> dict:
    claims = json.loads(paths.claims.read_text()) if paths.claims.exists() else []
    scored = json.loads(paths.receipts.read_text()) if paths.receipts.exists() else {"weights": {}, "receipts": []}
    receipt_of = {r["claim_id"]: r for r in scored["receipts"]}

    history = []
    if paths.history.exists():
        history = [json.loads(line) for line in paths.history.read_text().splitlines() if line.strip()]

    # The newest snapshot is when a page last changed, which is a fact about the world, not about this run.
    snapshots = sorted(p.stem for p in paths.snapshots.glob("*/*.json")) if paths.snapshots.exists() else []

    data = {
        "last_change": snapshots[-1] if snapshots else None,
        "claims": [{**c, "receipt": receipt_of.get(c["id"])} for c in claims],
        "weights": scored["weights"],
        "changes": history[-HISTORY_LIMIT:][::-1],
        "dropped": json.loads(paths.dropped.read_text()) if paths.dropped.exists() else [],
    }
    paths.site_data.parent.mkdir(parents=True, exist_ok=True)
    paths.site_data.write_text("window.LEDGER = " + json.dumps(data, separators=(",", ":"), sort_keys=True) + ";\n")
    return data
