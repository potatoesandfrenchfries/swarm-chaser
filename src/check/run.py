"""Run every claim through each checker vendor (MVP M4.3).

    specs = checker_specs()                      # two ModelSpec from config.toml [checkers]
    client = ModelClient(specs["a"], transport, mode="live", spend_cap_usd=5)
    verdicts = run_checks(claims, rows, client.as_caller(), judge_name=specs["a"].label)

Each vendor gets its own `ModelClient`, so its answers are cached under its own key and a rerun from
the cache makes no call. `checker_requests` gives the (prompt, text) pairs a run would send, in the
shape `ModelClient.estimate` takes, so the call count and cost are known before a paid run.
"""
import tomllib
from pathlib import Path
from typing import Callable, Optional

from check.checker import CHECKER_PROMPT, MAX_WINDOW_CHARS, Verdict, check_claim, checker_input, claim_window, window_text
from llm.client import ModelSpec, ReplyNotJSON

CONFIG = Path(__file__).resolve().parent.parent.parent / "config.toml"
SPEC_KEYS = ("vendor", "model", "temperature", "max_tokens", "usd_per_mtok_in", "usd_per_mtok_out")


def checker_specs(path: Path = CONFIG) -> dict[str, ModelSpec]:
    """The checker models named in config.toml's `[checkers.<name>]` tables. M4 needs two, from different vendors."""
    table = tomllib.loads(Path(path).read_text(encoding="utf-8")).get("checkers", {})
    # No temperature unless the entry sets one: ModelSpec's 0.0 default would be sent and the API rejects it.
    specs = {name: ModelSpec(**{"temperature": None, **{k: v for k, v in entry.items() if k in SPEC_KEYS}}) for name, entry in table.items()}
    if len(specs) < 2:
        raise ValueError(f"config.toml [checkers] names {len(specs)} model(s); M4 needs two checker vendors")
    if len({s.vendor for s in specs.values()}) < 2:
        raise ValueError("the checker models must come from different vendors; see MVP.md M4")
    return specs


def checker_requests(claims: list, rows: list[dict], max_chars: int = MAX_WINDOW_CHARS) -> list[tuple[str, str]]:
    return [(CHECKER_PROMPT, checker_input(c, window_text(claim_window(c, rows, max_chars)))) for c in claims]


def run_checks(
    claims: list, rows: list[dict], call_checker: Callable[[str, str], dict], judge_name: str, failed: Optional[list] = None
) -> list[Verdict]:
    """One `Verdict` per claim from one checker. A reply that is not JSON stops the run, unless `failed`
    is given: then the claim's id is appended to it and the run goes on, so a long run survives one bad
    reply and the caller can still report how many claims got no verdict from this vendor.
    """
    verdicts = []
    for c in claims:
        try:
            verdicts.append(check_claim(c, claim_window(c, rows), call_checker, judge_name))
        except ReplyNotJSON:
            if failed is None:
                raise
            failed.append(c.claim_id)
    return verdicts
