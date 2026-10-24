"""One spend budget for every paid call in the project (MVP M1.2, issue #19).

`ModelClient` enforces a cap, but only on what it has spent itself, in one process. A new process or a
second client would start again from zero, so a total of three pounds could not be held across the
extraction run, the checker runs and any rerun. This module makes the cap a total: it counts what the
shared cache already holds, and the caller gives each new client only the rest.

    cap = remaining_usd(DEFAULT_CACHE, specs.values())
    client = ModelClient(specs["a"], transport, mode="live", spend_cap_usd=cap)

Make clients one after another and ask again before each, because two clients created together would each
be offered the whole remainder. Cached answers cost nothing, so a rerun from the cache spends nothing.

The total and the exchange rate are in `config.toml` `[spend]`. The rate is an assumption, not a live rate.
"""
import sqlite3
import tomllib
from collections.abc import Iterable
from pathlib import Path

from llm.client import ModelSpec

CONFIG = Path(__file__).resolve().parent.parent.parent / "config.toml"


def total_cap_usd(path: Path = CONFIG) -> float:
    """The whole budget in dollars: `cap_gbp` times `usd_per_gbp` from config.toml `[spend]`."""
    table = tomllib.loads(Path(path).read_text(encoding="utf-8")).get("spend", {})
    try:
        cap_gbp, rate = float(table["cap_gbp"]), float(table["usd_per_gbp"])
    except KeyError as missing:
        raise ValueError(f"config.toml [spend] needs {missing.args[0]}") from None
    if cap_gbp <= 0 or rate <= 0:
        raise ValueError(f"cap_gbp and usd_per_gbp must be positive, got {cap_gbp} and {rate}")
    return cap_gbp * rate


def spent_usd(cache_path: str | Path, specs: Iterable[ModelSpec]) -> float:
    """Dollars already spent, from the token counts stored with every cached answer, priced by `specs`.

    Raises if the cache holds answers from a model that is not in `specs` (or has no prices): the total
    could not be trusted, and guessing zero would let the cap be exceeded without anyone noticing.
    """
    path = Path(cache_path)
    if str(cache_path) == ":memory:" or not path.exists():
        return 0.0
    priced = {(s.vendor, s.model): s for s in specs}
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        rows = db.execute("SELECT vendor, model, SUM(tokens_in), SUM(tokens_out) FROM calls GROUP BY vendor, model").fetchall()
    except sqlite3.OperationalError:  # no `calls` table yet: nothing has been cached
        return 0.0
    finally:
        db.close()
    total = 0.0
    for vendor, model, tokens_in, tokens_out in rows:
        spec = priced.get((vendor, model))
        cost = spec.cost(tokens_in, tokens_out) if spec else None
        if cost is None:
            raise ValueError(f"the cache holds answers from {vendor}/{model}, which has no price in `specs`; the spend so far cannot be totalled")
        total += cost
    return total


def remaining_usd(cache_path: str | Path, specs: Iterable[ModelSpec], config: Path = CONFIG) -> float:
    """What a new client may still spend: the total budget less what the cache says is spent, never below zero."""
    return max(0.0, total_cap_usd(config) - spent_usd(cache_path, specs))
