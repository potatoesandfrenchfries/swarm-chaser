"""Fitness is a vector, not a number. A candidate is kept if nothing else beats it on every axis."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Objective:
    name: str
    maximize: bool = True
    #: The one axis used to rank candidates and pick the champion. Exactly one objective is primary.
    primary: bool = False


@dataclass
class Fitness:
    values: dict[str, float] = field(default_factory=dict)
    #: Set when evaluation raised. An errored candidate loses to every working one.
    error: str | None = None


def _oriented(fitness: Fitness, objectives: list[Objective]) -> list[float]:
    """Values flipped so that bigger is always better."""
    return [fitness.values[o.name] * (1 if o.maximize else -1) for o in objectives]


def dominates(a: Fitness, b: Fitness, objectives: list[Objective]) -> bool:
    """Does `a` beat `b`: at least as good on every axis, and strictly better on one?"""
    if a.error or b.error:
        return b.error is not None and a.error is None
    va, vb = _oriented(a, objectives), _oriented(b, objectives)
    return all(x >= y for x, y in zip(va, vb)) and any(x > y for x, y in zip(va, vb))


def pareto_frontier(items: list[tuple[object, Fitness]], objectives: list[Objective]) -> list[tuple[object, Fitness]]:
    """The non-dominated members. These are the trade-offs worth keeping: the best on each
    axis and every sensible compromise between them, not just whoever wins on average.
    Candidates that errored are never on it, even when every candidate errored."""
    working = [item for item in items if not item[1].error]
    return [
        item
        for i, item in enumerate(working)
        if not any(dominates(other[1], item[1], objectives) for j, other in enumerate(working) if i != j)
    ]


def primary_of(objectives: list[Objective]) -> Objective:
    primaries = [o for o in objectives if o.primary]
    if len(primaries) != 1:
        raise ValueError("exactly one objective must be primary")
    return primaries[0]
