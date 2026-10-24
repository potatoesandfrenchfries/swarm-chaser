# Evolve harness template

Tune anything with parameters by letting it evolve overnight: mutate a population,
test every candidate against a zoo of opponents, keep the candidates nothing else
beats, and breed the next generation from them. It runs unattended, resumes
after a crash, and writes a readable report per generation.

Distilled from a poker bot built for the Fullhouse Hackathon 2026 (Quadrature
Capital): a blueprint strategy whose ~20 numbers (bet sizes, bluff frequency,
equity thresholds) were tuned by an "observe, test, improve" loop against 14
adversary bots. The poker engine is gone; the loop is generic and the demo is a
self-contained auction game.

**Stack:** Python 3.10+, standard library only (no installs).

## Run it

```bash
python -m evolve run --problem examples.auction --generations 20
python -m evolve show                      # the champion so far
python -m unittest                         # 29 tests, about a second
```

Stop it any time; run the same command again and it picks up where it left off
(`--fresh` starts over). Each generation is saved to `archive/gen_NNNN/` as
`results.json` and a `REPORT.md` table, and `archive/state.json` holds the champion
and the next population.

| Flag                  | What it does                                                          |
| --------------------- | --------------------------------------------------------------------- |
| `--generations N`     | Generations to run now (default 20)                                   |
| `--population N`      | Candidates per generation (default 8)                                 |
| `--seeds N`           | Training seeds per generation, fresh each time (default 2)            |
| `--validation-seeds N`| Held-out seeds used to confirm a champion (default 4)                 |
| `--patience N`        | Stop after N generations with no new champion                         |
| `--max-hours H`       | Stop after H hours: for an overnight run                              |
| `--seed N`            | Random seed; the same seed gives the same run                         |

In the demo, 12 generations take the starting bidder from 0.133 to 0.164 profit
per round on seeds it never trained on.

## Make it your own

You write one file: a problem with a search space, objectives, and a function that
scores a candidate. Copy `examples/auction.py`.

```python
class MyProblem:
    space = Space({"bet_size": Gene(0.2, 1.0), "patience": Gene(1, 50, integer=True)})
    objectives = [
        Objective("win_rate", primary=True),   # exactly one primary
        Objective("worst_case"),               # keep the candidates that are best on each axis
        Objective("latency_ms", maximize=False),
    ]
    def seed_genome(self): return {"bet_size": 0.5, "patience": 10}
    def evaluate(self, genome, seeds): ...     # play or score it; return a number per objective
PROBLEM = MyProblem()
```

Then `python -m evolve run --problem mymodule`. `evaluate` is where your system
plugs in: call your game engine, run a simulator, shell out to a tournament
runner. A candidate that raises is recorded as an error and loses to every
working one; it does not stop the run.

## How the loop works

```
             ┌────────────────────────────────────────────────┐
             ▼                                                │
  TEST every candidate (fresh seeds)  →  KEEP the Pareto frontier
                                              │
                    CHECK the best on held-out seeds → champion?
                                              │
  IMPROVE: elites + mutants + crossovers + random newcomers  ─┘
```

| File               | What                                                                          |
| ------------------ | ----------------------------------------------------------------------------- |
| `evolve/space.py`  | `Gene`, `Space`: bounds, random sampling, mutation, crossover                 |
| `evolve/fitness.py`| `Objective`, `Fitness`, `dominates`, `pareto_frontier`                        |
| `evolve/loop.py`   | `Evolver`: the generation cycle, archive, resume, champion check              |
| `evolve/__main__.py` | the `run` and `show` commands                                               |
| `examples/auction.py` | the demo problem: a bidder against five opponents                          |

Decisions worth keeping:

- **A frontier, not one winner.** Fitness is a vector. A candidate survives if nothing beats it on every axis, so you keep the best bot against the worst opponent, the cheapest decent bot, and the compromises between them, instead of whatever scores best on average and collapses against one opponent.
- **Fresh seeds, held-out champion.** New training seeds each generation stop the population memorizing one lucky draw. But the best score of eight candidates on any one draw is optimistic, so the winner is re-scored on separate held-out seeds and becomes champion only if it beats the old champion *there*. The original took the best raw score each generation.
- **Reproducible and resumable.** Every random choice in generation *g* comes from a generator seeded by `(seed, g)`, and the full state is saved atomically after each generation. A run stopped at generation 3 and resumed gives byte-identical results to one that never stopped (tested).
- **Novelty keeps it honest.** A share of each generation is random newcomers, so the population cannot collapse onto one local peak. Mutation occasionally takes a five-times-larger step for the same reason.
- **Failure is data.** A crash, a non-finite number, or a missing objective marks that candidate as an error and the run continues. If a whole generation fails, the next one restarts from the seed genome, not from broken parents.

## Things to know

- **A larger zoo beats a longer run.** The population fits whatever it is tested against. If the zoo is three bots, you will get a bot that beats those three. Add opponents that behave differently, and add new ones as you meet them.
- **Noise sets the ceiling.** With few seeds per generation and noisy games, differences smaller than the noise are not improvements. Raise `--seeds` and `--validation-seeds` before trusting a small gain, and re-check the final champion on a larger fresh set.
- **Cost is yours to bound.** Each candidate is evaluated every generation, elites included, because their seeds changed. Budget `population x opponents x seeds x cost of one match` per generation.
- **It tunes parameters, not logic.** The search space is a flat set of bounded numbers. Evolving structure (new rules, new features) is a different tool; this one finds the best settings for a design you already have.
- **The demo is a toy.** It shows the loop working; it is not a model of real auctions, and the opponents in it are simple on purpose.
- **Not run against a real engine here.** The loop and the demo are tested; plugging in a heavier `evaluate` (a game server, a subprocess) is yours to verify. Use timeouts there, so one hung candidate cannot stall a night's run.
