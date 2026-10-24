"""Cached, spend-capped model calls shared by every LLM stage (MVP M13.1).

Every stage takes an injected `call(prompt, text) -> dict` (extract, check, link, forecast).
`ModelClient.as_caller()` returns exactly that, so a stage never sees a vendor SDK. Answers are
stored in SQLite keyed by (vendor, model, settings, system prompt, user text), so a rerun from
the same cache makes no API calls and returns identical answers (M13 "one command reruns the
pipeline from cached model answers").

This module is stdlib-only and makes no network call itself: the vendor SDK lives in a
`transport`, supplied from `adapters/vendors.py`. Nothing here reads the clock, and the cache
holds no timestamps, so rerunning produces the same file contents.

Modes, the default being the safe one (pipeline-rules: no paid calls without approval):
- "offline": cache hits only; a miss raises `CacheMiss`.
- "live": a miss calls the transport, subject to the spend cap.
Use `estimate()` first to see how many calls would be live and what they would cost.

The cache holds text derived from the village export, whose terms are research use only, so it
stays local (`cache/` is in .gitignore) and is never committed.
"""
import hashlib
import json
import math
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

CHARS_PER_TOKEN = 4  # rough English figure, used only for estimates before a call is made
DEFAULT_CACHE = "cache/llm.sqlite"


class CacheMiss(RuntimeError):
    """Offline mode was asked for an answer that is not in the cache."""


class SpendCapExceeded(RuntimeError):
    """A live call would take the session past the spend cap."""


class ReplyNotJSON(ValueError):
    """The model's reply held no parseable JSON object."""


@dataclass(frozen=True)
class ModelSpec:
    """One model on one vendor, with the settings that change its answers (so they are in the cache key).

    Prices are USD per million tokens and are supplied by whoever configures the run; this
    module does not guess them. `None` means unknown, and a spend cap cannot be used without them.
    """

    vendor: str  # label only, e.g. "anthropic", "openrouter", "gemini"; the transport decides what it means
    model: str
    temperature: float | None = 0.0
    max_tokens: int = 4096
    usd_per_mtok_in: float | None = None
    usd_per_mtok_out: float | None = None

    @property
    def label(self) -> str:
        return f"{self.vendor}/{self.model}"

    def cost(self, tokens_in: int, tokens_out: int) -> float | None:
        if self.usd_per_mtok_in is None or self.usd_per_mtok_out is None:
            return None
        return (tokens_in * self.usd_per_mtok_in + tokens_out * self.usd_per_mtok_out) / 1_000_000


@dataclass(frozen=True)
class Completion:
    text: str
    tokens_in: int = 0
    tokens_out: int = 0


Transport = Callable[[ModelSpec, str, str], Completion]  # (spec, system, user) -> Completion


@dataclass(frozen=True)
class Estimate:
    """What a batch would do, before any call is made. Duplicate requests count once."""

    n_requests: int
    n_cached: int
    n_live: int
    tokens_in: int
    tokens_out: int  # an upper bound: every live call assumed to use `expected_out_tokens`
    cost_usd: float | None  # None when the spec has no prices
    within_cap: bool | None  # None when there is no cap or no prices


def estimate_tokens(text: str) -> int:
    return math.ceil(len(text) / CHARS_PER_TOKEN)


def request_key(spec: ModelSpec, system: str, user: str) -> str:
    payload = json.dumps([spec.vendor, spec.model, spec.temperature, spec.max_tokens, system, user], ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def parse_json_object(text: str) -> dict:
    """The first `{` to the last `}` of a reply, so a ```json fence or a sentence around it is tolerated."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end < start:
        raise ReplyNotJSON(text[:200])
    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ReplyNotJSON(text[:200]) from exc
    if not isinstance(parsed, dict):
        raise ReplyNotJSON(text[:200])
    return parsed


class ModelClient:
    def __init__(
        self,
        spec: ModelSpec,
        transport: Transport | None = None,
        cache_path: str | Path = DEFAULT_CACHE,
        mode: str = "offline",
        spend_cap_usd: float | None = None,
    ):
        if mode not in ("offline", "live"):
            raise ValueError(f"mode must be 'offline' or 'live', not {mode!r}")
        if mode == "live" and transport is None:
            raise ValueError("live mode needs a transport")
        if spend_cap_usd is not None and spec.cost(1, 1) is None:
            raise ValueError(f"a spend cap needs prices on the spec for {spec.label}")
        self.spec = spec
        self.transport = transport
        self.mode = mode
        self.spend_cap_usd = spend_cap_usd
        self.spent_usd = 0.0
        self.live_calls = 0
        self.cache_hits = 0
        if str(cache_path) != ":memory:":
            Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(cache_path))
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS calls (key TEXT PRIMARY KEY, vendor TEXT, model TEXT, system_sha256 TEXT, text TEXT, tokens_in INTEGER, tokens_out INTEGER)"
        )

    def close(self) -> None:
        self._db.close()

    def _lookup(self, key: str) -> Completion | None:
        row = self._db.execute("SELECT text, tokens_in, tokens_out FROM calls WHERE key = ?", (key,)).fetchone()
        return Completion(*row) if row else None

    def is_cached(self, system: str, user: str) -> bool:
        return self._lookup(request_key(self.spec, system, user)) is not None

    def complete(self, system: str, user: str) -> Completion:
        key = request_key(self.spec, system, user)
        hit = self._lookup(key)
        if hit is not None:
            self.cache_hits += 1
            return hit
        if self.mode == "offline":
            raise CacheMiss(f"{self.spec.label}: no cached answer for key {key[:12]} (offline mode)")

        if self.spend_cap_usd is not None:
            worst_case = self.spec.cost(estimate_tokens(system) + estimate_tokens(user), self.spec.max_tokens)
            if self.spent_usd + worst_case > self.spend_cap_usd:
                raise SpendCapExceeded(f"{self.spec.label}: ${self.spent_usd:.4f} spent, next call could cost ${worst_case:.4f}, cap ${self.spend_cap_usd:.2f}")

        result = self.transport(self.spec, system, user)
        self.live_calls += 1
        self.spent_usd += self.spec.cost(result.tokens_in, result.tokens_out) or 0.0
        self._db.execute(
            "INSERT OR REPLACE INTO calls VALUES (?, ?, ?, ?, ?, ?, ?)",
            (key, self.spec.vendor, self.spec.model, hashlib.sha256(system.encode("utf-8")).hexdigest(), result.text, result.tokens_in, result.tokens_out),
        )
        self._db.commit()
        return result

    def json(self, system: str, user: str) -> dict:
        return parse_json_object(self.complete(system, user).text)

    def as_caller(self) -> Callable[[str, str], dict]:
        """The `call(prompt, text) -> dict` shape that `check_claim` and the other stages take.
        A reply that is not JSON raises `ReplyNotJSON` instead of becoming an empty answer,
        which a stage would otherwise read as "no claims" or "unverifiable".
        """
        return self.json

    def estimate(self, requests: list[tuple[str, str]], expected_out_tokens: int | None = None) -> Estimate:
        out_each = self.spec.max_tokens if expected_out_tokens is None else expected_out_tokens
        unique = list(dict.fromkeys(requests))
        live = [(s, u) for s, u in unique if not self.is_cached(s, u)]
        tokens_in = sum(estimate_tokens(s) + estimate_tokens(u) for s, u in live)
        tokens_out = out_each * len(live)
        cost = self.spec.cost(tokens_in, tokens_out)
        within = None if cost is None or self.spend_cap_usd is None else self.spent_usd + cost <= self.spend_cap_usd
        return Estimate(len(unique), len(unique) - len(live), len(live), tokens_in, tokens_out, cost, within)
