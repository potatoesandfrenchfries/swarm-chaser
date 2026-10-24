"""The loop: observe the last generation, test the population, improve it. Repeat.

Each generation:
  1. TEST     every genome is evaluated on fresh seeds
  2. KEEP     the Pareto frontier survives
  3. CHECK    the best candidate by the primary objective is re-evaluated on held-out
              seeds; it becomes champion only if it beats the previous champion THERE
  4. IMPROVE  next population = elites + mutants + crossovers + random newcomers

Two properties the original lacked, both about trusting the numbers:
  * Fresh seeds every generation stop the population fitting one lucky draw, but
    they also make each generation's best score optimistic (the winner's curse).
    The held-out re-check is what keeps a lucky candidate from becoming champion.
  * Every random choice in generation g comes from Random(seed, g), and the whole
    state is saved after each generation, so a stopped run resumes exactly where an
    uninterrupted one would have been.
"""
from __future__ import annotations

import json
import math
import random
import time
from dataclasses import asdict
from pathlib import Path
from typing import Callable, Protocol

from .fitness import Fitness, Objective, pareto_frontier, primary_of
from .space import Genome, Space


class Problem(Protocol):
    """What you supply. See examples/auction.py."""

    space: Space
    objectives: list[Objective]

    def seed_genome(self) -> Genome: ...

    def evaluate(self, genome: Genome, seeds: list[int]) -> dict[str, float]:
        """Play/score this genome on these seeds. Return one number per objective. May raise."""
        ...


class Evolver:
    def __init__(
        self,
        problem: Problem,
        archive: Path | str,
        population: int = 8,
        seeds_per_generation: int = 2,
        validation_seeds: int = 4,
        rng_seed: int = 42,
        sigma: float = 0.15,
        log: Callable[[str], None] = print,
    ):
        if population < 2:
            raise ValueError("population must be at least 2")
        self.problem = problem
        self.archive = Path(archive)
        self.population_size = population
        self.seeds_per_generation = seeds_per_generation
        self.validation_seeds = validation_seeds
        self.rng_seed = rng_seed
        self.sigma = sigma
        self.log = log
        self.objectives = problem.objectives
        self.primary = primary_of(self.objectives)
        self.state_file = self.archive / "state.json"

    # ---- seeds and randomness: derived from (rng_seed, generation), never from hidden state

    def _rng(self, generation: int, stream: str) -> random.Random:
        return random.Random(f"{self.rng_seed}:{generation}:{stream}")

    def _seeds(self, generation: int) -> list[int]:
        rng = self._rng(generation, "train")
        return [rng.randint(1, 10**9) for _ in range(self.seeds_per_generation)]

    def _validation_seeds(self) -> list[int]:
        """The same held-out seeds every generation, so champions are compared like with like."""
        rng = self._rng(-1, "validation")
        return [rng.randint(1, 10**9) for _ in range(self.validation_seeds)]

    # ---- state

    def _initial_population(self) -> list[Genome]:
        rng = self._rng(0, "init")
        seed = self.problem.space.clamp(self.problem.seed_genome())
        return [seed] + [self.problem.space.mutate(seed, rng, self.sigma) for _ in range(self.population_size - 1)]

    def load_state(self) -> dict | None:
        return json.loads(self.state_file.read_text()) if self.state_file.exists() else None

    def _save_state(self, state: dict):
        self.archive.mkdir(parents=True, exist_ok=True)
        tmp = self.state_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=1))
        tmp.replace(self.state_file)  # atomic: a crash cannot leave half a file

    # ---- evaluation

    def evaluate(self, genome: Genome, seeds: list[int]) -> Fitness:
        try:
            values = self.problem.evaluate(genome, seeds)
            missing = {o.name for o in self.objectives} - set(values)
            if missing:
                raise ValueError(f"evaluate() did not return {sorted(missing)}")
            if any(not math.isfinite(values[o.name]) for o in self.objectives):
                raise ValueError("evaluate() returned a non-finite value")
            return Fitness(values={o.name: float(values[o.name]) for o in self.objectives})
        except Exception as error:  # one broken candidate must not stop an overnight run
            return Fitness(error=f"{type(error).__name__}: {error}")

    # ---- the generation

    def run(self, generations: int, max_hours: float | None = None, patience: int | None = None, resume: bool = True) -> dict:
        """Run up to `generations` more generations (counted from where the archive left off)."""
        state = self.load_state() if resume else None
        if state is None:
            state = {
                "next_generation": 0,
                "population": self._initial_population(),
                "champion": None,
                "champion_validation": None,
                "stale": 0,
                "config": {"rng_seed": self.rng_seed, "population": self.population_size, "objectives": [asdict(o) for o in self.objectives]},
            }
        elif state["config"]["rng_seed"] != self.rng_seed or state["config"]["population"] != self.population_size:
            raise ValueError("this archive was started with a different seed or population size; use a new archive or matching settings")

        started = time.time()
        for _ in range(generations):
            if max_hours is not None and (time.time() - started) / 3600 > max_hours:
                self.log("[evolve] time limit reached")
                break
            if patience is not None and state["stale"] >= patience:
                self.log(f"[evolve] no improvement in {patience} generations, stopping")
                break
            state = self._generation(state)
        return state

    def _generation(self, state: dict) -> dict:
        gen = state["next_generation"]
        population: list[Genome] = state["population"]
        seeds = self._seeds(gen)

        scored = [(genome, self.evaluate(genome, seeds)) for genome in population]
        frontier = pareto_frontier(scored, self.objectives)
        working = [s for s in scored if not s[1].error]
        ranked = sorted(working, key=lambda s: s[1].values[self.primary.name] * (1 if self.primary.maximize else -1), reverse=True)

        improved = False
        if ranked:
            best_genome, best_fit = ranked[0]
            held_out = self.evaluate(best_genome, self._validation_seeds())
            if not held_out.error:
                score = held_out.values[self.primary.name] * (1 if self.primary.maximize else -1)
                if state["champion_validation"] is None or score > state["champion_validation"]:
                    state["champion"], state["champion_validation"], improved = best_genome, score, True
                    self.log(f"[gen {gen:04d}] NEW CHAMPION {self.primary.name}={held_out.values[self.primary.name]:+.4f} on held-out seeds (train {best_fit.values[self.primary.name]:+.4f})")
        state["stale"] = 0 if improved else state["stale"] + 1
        self._write_generation(gen, scored, frontier, seeds)

        state["next_generation"] = gen + 1
        state["population"] = self._next_population(frontier, gen)
        self._save_state(state)
        best = ranked[0][1].values[self.primary.name] if ranked else float("nan")
        errors = sum(1 for _, f in scored if f.error)
        self.log(f"[gen {gen:04d}] best {self.primary.name}={best:+.4f}  frontier={len(frontier)}/{len(scored)}  errors={errors}")
        return state

    def _next_population(self, frontier: list[tuple[Genome, Fitness]], gen: int) -> list[Genome]:
        """Elites (kept as they are), mutants of elites, crossovers, then random newcomers to fill the rest."""
        rng = self._rng(gen, "improve")
        space, size = self.problem.space, self.population_size
        working = [g for g, f in frontier if not f.error]
        if not working:  # everything failed: start over from the seed rather than from broken parents
            return [space.clamp(self.problem.seed_genome())] + [space.random(rng) for _ in range(size - 1)]

        elites = working[: max(1, size // 2)]
        population = list(elites)
        for _ in range(int(size * 0.35)):
            population.append(space.mutate(rng.choice(elites), rng, self.sigma, n_genes=rng.randint(2, 4)))
        if len(elites) >= 2:
            for _ in range(max(1, size // 8)):
                a, b = rng.sample(elites, 2)
                population.append(space.crossover(a, b, rng))
        while len(population) < size:
            population.append(space.random(rng))  # novelty: keeps the population from collapsing onto one peak
        return population[:size]

    def _write_generation(self, gen: int, scored, frontier, seeds):
        folder = self.archive / f"gen_{gen:04d}"
        folder.mkdir(parents=True, exist_ok=True)
        on_frontier = {id(g) for g, _ in frontier}
        rows = [{"genome": g, "fitness": f.values, "error": f.error, "frontier": id(g) in on_frontier} for g, f in scored]
        (folder / "results.json").write_text(json.dumps({"seeds": seeds, "results": rows}, indent=1))

        names = [o.name for o in self.objectives]
        lines = [f"# Generation {gen}", "", f"Population {len(scored)}, frontier {len(frontier)}, seeds {seeds}", "",
                 "| # | " + " | ".join(names) + " | frontier |", "|---|" + "---|" * (len(names) + 1)]
        key = lambda r: -(r[1]["fitness"].get(self.primary.name, float("-inf")) * (1 if self.primary.maximize else -1)) if not r[1]["error"] else 1e18
        for i, row in sorted(enumerate(rows), key=key):
            cells = [f"{row['fitness'][n]:+.3f}" for n in names] if not row["error"] else ["error"] * len(names)
            lines.append(f"| {i} | " + " | ".join(cells) + f" | {'yes' if row['frontier'] else ''} |")
        (folder / "REPORT.md").write_text("\n".join(lines) + "\n")
