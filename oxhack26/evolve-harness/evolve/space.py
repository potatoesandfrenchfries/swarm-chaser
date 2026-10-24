"""The search space: named parameters with bounds. Everything the loop changes lives here."""
from __future__ import annotations

import random
from copy import deepcopy
from dataclasses import dataclass


@dataclass(frozen=True)
class Gene:
    low: float
    high: float
    integer: bool = False

    def clamp(self, value: float) -> float | int:
        value = max(self.low, min(self.high, value))
        return int(round(value)) if self.integer else float(value)

    def sample(self, rng: random.Random) -> float | int:
        return self.clamp(rng.uniform(self.low, self.high))


Genome = dict[str, float | int]


class Space:
    def __init__(self, genes: dict[str, Gene]):
        if not genes:
            raise ValueError("a search space needs at least one gene")
        for name, g in genes.items():
            if g.low >= g.high:
                raise ValueError(f"gene {name!r}: low must be below high")
        self.genes = genes

    def clamp(self, genome: Genome) -> Genome:
        """Force a genome into bounds, filling any missing gene with its midpoint."""
        return {k: g.clamp(genome.get(k, (g.low + g.high) / 2)) for k, g in self.genes.items()}

    def random(self, rng: random.Random) -> Genome:
        """A fresh genome sampled uniformly. Used for novelty, so the population cannot collapse."""
        return {k: g.sample(rng) for k, g in self.genes.items()}

    def mutate(self, parent: Genome, rng: random.Random, sigma: float = 0.15, n_genes: int = 3, big_chance: float = 0.05) -> Genome:
        """Perturb `n_genes` genes by a Gaussian a fraction `sigma` of their range wide.
        With probability `big_chance` the step is five times larger, to escape a local peak."""
        child = deepcopy(self.clamp(parent))
        step = sigma * (5.0 if rng.random() < big_chance else 1.0)
        for name in rng.sample(list(self.genes), k=min(n_genes, len(self.genes))):
            gene = self.genes[name]
            child[name] = gene.clamp(child[name] + rng.gauss(0, (gene.high - gene.low) * step))
        return child

    def crossover(self, a: Genome, b: Genome, rng: random.Random) -> Genome:
        """Each gene comes from one parent or the other, at random."""
        return {k: (a[k] if rng.random() < 0.5 else b[k]) for k in self.genes}
