import json
import random
import shutil
import tempfile
import unittest
from pathlib import Path

from evolve import Evolver, Fitness, Gene, Objective, Space, dominates, pareto_frontier
from evolve.fitness import primary_of
from examples.auction import PROBLEM as AUCTION


def silent(_):
    pass


class Peak:
    """Maximise closeness to x = 0.7; a second axis (cost) prefers small y. Cheap and fully deterministic."""

    space = Space({"x": Gene(0.0, 1.0), "y": Gene(1, 20, integer=True)})
    objectives = [Objective("score", primary=True), Objective("cost", maximize=False)]

    def seed_genome(self):
        return {"x": 0.1, "y": 10}

    def evaluate(self, genome, seeds):
        noise = sum(random.Random(s).uniform(-0.02, 0.02) for s in seeds)
        return {"score": 1 - abs(genome["x"] - 0.7) + noise, "cost": float(genome["y"])}


class SpaceTests(unittest.TestCase):
    space = Space({"a": Gene(0.0, 1.0), "n": Gene(1, 10, integer=True)})

    def test_mutation_stays_in_bounds_and_integers_stay_integers(self):
        rng = random.Random(1)
        g = {"a": 0.5, "n": 5}
        for _ in range(500):
            g = self.space.mutate(g, rng, sigma=0.5, big_chance=0.5)
            self.assertTrue(0.0 <= g["a"] <= 1.0 and 1 <= g["n"] <= 10)
            self.assertIsInstance(g["n"], int)

    def test_mutation_changes_at_most_n_genes_and_never_the_parent(self):
        parent = {"a": 0.5, "n": 5}
        child = self.space.mutate(parent, random.Random(2), n_genes=1)
        self.assertEqual(parent, {"a": 0.5, "n": 5})
        self.assertLessEqual(sum(child[k] != parent[k] for k in parent), 1)

    def test_crossover_takes_each_gene_from_a_parent(self):
        a, b = {"a": 0.1, "n": 1}, {"a": 0.9, "n": 9}
        for seed in range(20):
            child = self.space.crossover(a, b, random.Random(seed))
            self.assertIn(child["a"], (0.1, 0.9))
            self.assertIn(child["n"], (1, 9))

    def test_clamp_repairs_out_of_range_and_missing_genes(self):
        self.assertEqual(self.space.clamp({"a": 5.0}), {"a": 1.0, "n": 6})

    def test_random_is_reproducible(self):
        self.assertEqual(self.space.random(random.Random(7)), self.space.random(random.Random(7)))

    def test_rejects_an_empty_or_inverted_space(self):
        with self.assertRaises(ValueError):
            Space({})
        with self.assertRaises(ValueError):
            Space({"a": Gene(1.0, 1.0)})


class FitnessTests(unittest.TestCase):
    objectives = [Objective("gain", primary=True), Objective("cost", maximize=False)]

    def fit(self, gain, cost):
        return Fitness(values={"gain": gain, "cost": cost})

    def test_dominance_respects_the_direction_of_each_objective(self):
        self.assertTrue(dominates(self.fit(2, 1), self.fit(1, 2), self.objectives))   # more gain, less cost
        self.assertFalse(dominates(self.fit(2, 5), self.fit(1, 2), self.objectives))  # more gain but dearer: a trade-off
        self.assertFalse(dominates(self.fit(1, 2), self.fit(2, 5), self.objectives))

    def test_equal_fitness_does_not_dominate(self):
        self.assertFalse(dominates(self.fit(1, 1), self.fit(1, 1), self.objectives))

    def test_frontier_keeps_trade_offs_and_drops_the_beaten(self):
        items = [("cheap", self.fit(1, 1)), ("rich", self.fit(5, 9)), ("beaten", self.fit(0.5, 2)), ("mid", self.fit(3, 4))]
        names = {name for name, _ in pareto_frontier(items, self.objectives)}
        self.assertEqual(names, {"cheap", "rich", "mid"})

    def test_an_errored_candidate_loses_to_any_working_one_and_never_dominates(self):
        broken = Fitness(error="boom")
        self.assertTrue(dominates(self.fit(-9, 99), broken, self.objectives))
        self.assertFalse(dominates(broken, self.fit(-9, 99), self.objectives))
        self.assertFalse(dominates(broken, Fitness(error="also"), self.objectives))

    def test_an_errored_candidate_is_never_on_the_frontier_even_if_all_errored(self):
        broken = [("a", Fitness(error="x")), ("b", Fitness(error="y"))]
        self.assertEqual(pareto_frontier(broken, self.objectives), [])

    def test_exactly_one_primary_objective_is_required(self):
        with self.assertRaises(ValueError):
            primary_of([Objective("a"), Objective("b")])


class LoopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="evolve-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def evolver(self, name="a", problem=None, **kw):
        return Evolver(problem or Peak(), self.tmp / name, log=silent, **kw)

    def test_the_same_seed_gives_the_same_run(self):
        a = self.evolver("a").run(5)
        b = self.evolver("b").run(5)
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))

    def test_a_different_seed_gives_a_different_run(self):
        a = self.evolver("a", rng_seed=1).run(4)
        b = self.evolver("b", rng_seed=2).run(4)
        self.assertNotEqual(a["population"], b["population"])

    def test_stopping_and_resuming_equals_running_straight_through(self):
        straight = self.evolver("straight").run(6)
        part = self.evolver("split")
        part.run(3)
        resumed = self.evolver("split").run(3)  # a fresh object, reading the archive
        self.assertEqual(resumed["next_generation"], 6)
        self.assertEqual(json.dumps(straight, sort_keys=True), json.dumps(resumed, sort_keys=True))

    def test_resume_refuses_a_mismatched_archive(self):
        self.evolver("a", population=8).run(1)
        with self.assertRaises(ValueError):
            self.evolver("a", population=6).run(1)

    def test_fresh_ignores_the_saved_state(self):
        self.evolver("a").run(3)
        state = self.evolver("a").run(2, resume=False)
        self.assertEqual(state["next_generation"], 2)

    def test_population_size_is_constant_and_every_genome_is_in_bounds(self):
        evolver = self.evolver("a", population=7)
        state = evolver.run(5)
        self.assertEqual(len(state["population"]), 7)
        for g in state["population"]:
            self.assertEqual(g, Peak.space.clamp(g))

    def test_it_actually_improves(self):
        state = self.evolver("a", population=8).run(15)
        self.assertAlmostEqual(state["champion"]["x"], 0.7, delta=0.12)

    def test_the_champion_only_ever_improves_on_the_held_out_seeds(self):
        evolver = self.evolver("a")
        seen = []
        for _ in range(10):
            state = evolver.run(1)
            seen.append(state["champion_validation"])
        self.assertEqual(seen, sorted(seen))

    def test_a_lucky_training_score_does_not_make_a_champion(self):
        class Lucky(Peak):
            """A genome with y == 20 posts a huge score on training seeds only; on the held-out seeds it is poor."""

            def evaluate(self, genome, seeds):
                values = super().evaluate(genome, seeds)
                if genome["y"] == 20 and not getattr(self, "validating", False):
                    values["score"] += 5
                return values

        problem = Lucky()
        evolver = self.evolver("a", problem=problem, validation_seeds=3)
        original = evolver._validation_seeds
        evolver._validation_seeds = lambda: (setattr(problem, "validating", True) or original())
        state = evolver.run(8)
        self.assertLess(state["champion_validation"], 2.0)  # the +5 never reached the champion's score

    def test_a_crashing_candidate_is_recorded_and_the_run_goes_on(self):
        class Fragile(Peak):
            def evaluate(self, genome, seeds):
                if genome["x"] < 0.4:
                    raise RuntimeError("bot crashed")
                return super().evaluate(genome, seeds)

        state = self.evolver("a", problem=Fragile()).run(4)
        self.assertEqual(state["next_generation"], 4)
        results = json.loads((self.tmp / "a" / "gen_0000" / "results.json").read_text())["results"]
        errored = [r for r in results if r["error"]]
        self.assertTrue(errored and all("bot crashed" in r["error"] for r in errored))
        self.assertTrue(all(not r["frontier"] for r in errored))

    def test_non_finite_and_missing_values_count_as_errors(self):
        class Wrong(Peak):
            def evaluate(self, genome, seeds):
                return {"score": float("nan"), "cost": 1.0} if genome["y"] % 2 else {"score": 1.0}

        evolver = self.evolver("a", problem=Wrong())
        self.assertIn("non-finite", evolver.evaluate({"x": 0.5, "y": 3}, [1]).error)
        self.assertIn("did not return", evolver.evaluate({"x": 0.5, "y": 4}, [1]).error)

    def test_if_every_candidate_fails_the_next_generation_restarts_from_the_seed(self):
        class Dead(Peak):
            def evaluate(self, genome, seeds):
                raise RuntimeError("always")

        state = self.evolver("a", problem=Dead()).run(2)
        self.assertEqual(state["population"][0], {"x": 0.1, "y": 10})
        self.assertIsNone(state["champion"])

    def test_patience_stops_a_stalled_run(self):
        class Flat(Peak):
            def evaluate(self, genome, seeds):
                return {"score": 1.0, "cost": float(genome["y"])}

        state = self.evolver("a", problem=Flat()).run(50, patience=3)
        self.assertLess(state["next_generation"], 10)

    def test_the_archive_has_a_report_and_machine_readable_results_per_generation(self):
        self.evolver("a").run(2)
        for gen in ("gen_0000", "gen_0001"):
            self.assertTrue((self.tmp / "a" / gen / "REPORT.md").read_text().startswith("# Generation"))
            self.assertIn("results", json.loads((self.tmp / "a" / gen / "results.json").read_text()))
        self.assertTrue((self.tmp / "a" / "state.json").exists())

    def test_rejects_a_population_of_one(self):
        with self.assertRaises(ValueError):
            self.evolver("a", population=1)


class AuctionDemoTests(unittest.TestCase):
    def test_the_demo_problem_is_valid_and_deterministic(self):
        g = AUCTION.seed_genome()
        self.assertEqual(AUCTION.space.clamp(g), g)
        self.assertEqual(AUCTION.evaluate(g, [1, 2]), AUCTION.evaluate(g, [1, 2]))

    def test_evolving_the_demo_beats_the_starting_bot_on_seeds_it_never_saw(self):
        tmp = Path(tempfile.mkdtemp(prefix="evolve-"))
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        state = Evolver(AUCTION, tmp, population=8, log=silent).run(12)
        unseen = [9001, 9002, 9003, 9004, 9005, 9006]
        before = AUCTION.evaluate(AUCTION.seed_genome(), unseen)["profit_avg"]
        after = AUCTION.evaluate(state["champion"], unseen)["profit_avg"]
        self.assertGreater(after, before)


if __name__ == "__main__":
    unittest.main()
