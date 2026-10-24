"""A self-contained demo problem: tune a bidder for a repeated sealed-bid auction.

Each round, you and one opponent get a private value for a prize, drawn uniformly
from 0 to 1. Both bid in secret; the higher bid wins and pays its own bid, so you
earn (value - bid) when you win. Bidding your value earns nothing, bidding too
low loses the prize, and the best bid depends on how the opponent bids. After each
round you see the opponent's bid.

The bot estimates the opponent's typical bid from the last `window` rounds and
bids just enough above it to win, but never more than `ceiling` of its own value.
A longer window gives a steadier estimate against a fixed opponent and a slower
one against an opponent that reacts to you, and costs more memory: a genuine
trade-off for the Pareto frontier to find.

Replace this file with your own problem: same interface, your game.
"""
from __future__ import annotations

import random
from collections import deque

from evolve import Gene, Objective, Space

ROUNDS = 200


# ---- the opponents: the "zoo". Each takes (its value, a memory dict) and returns a bid.

def truthful(value, memory):      return value                # bids its value: easy to beat
def shader(value, memory):        return 0.6 * value          # a sensible fixed shade
def lowballer(value, memory):     return 0.3 * value          # rarely wins, so easy to out-bid
def noisy(value, memory):         return memory["rng"].uniform(0, value)

def copycat(value, memory):
    """Reacts to you: bids slightly above your last bid when it can afford it."""
    return min(value, memory.get("my_last_bid", 0.0) * 1.05 + 0.02)


ZOO = {"truthful": truthful, "shader": shader, "lowballer": lowballer, "noisy": noisy, "copycat": copycat}


def play(genome, opponent, seed, rounds=ROUNDS):
    """Returns (profit per round, share of rounds won)."""
    rng = random.Random(seed)
    memory = {"rng": random.Random(seed + 1)}
    seen: deque[float] = deque(maxlen=int(genome["window"]))
    profit = wins = 0.0
    for _ in range(rounds):
        mine, theirs = rng.random(), rng.random()
        estimate = sum(seen) / len(seen) if seen else 0.5
        explore = rng.random() < genome["explore"]
        bid = min(estimate + genome["margin"], mine * genome["ceiling"])
        if explore:
            bid = rng.uniform(0, mine)
        if bid >= mine:  # never bid at or above your own value
            bid = 0.0
        their_bid = opponent(theirs, memory)
        if bid > their_bid:
            profit += mine - bid
            wins += 1
        memory["my_last_bid"] = bid
        seen.append(their_bid)
    return profit / rounds, wins / rounds


class AuctionProblem:
    space = Space({
        "margin": Gene(0.0, 0.2),       # how far above the estimated opponent bid to go
        "ceiling": Gene(0.3, 1.0),      # never bid more than this share of your own value
        "window": Gene(1, 60, integer=True),   # how many past opponent bids to average
        "explore": Gene(0.0, 0.3),      # chance of a random bid, to learn the opponent
    })
    objectives = [
        Objective("profit_avg", maximize=True, primary=True),   # average across the zoo
        Objective("profit_worst", maximize=True),               # the one opponent you do worst against
        Objective("win_rate", maximize=True),
        Objective("memory", maximize=False),                    # the cost: bigger window, more to store
    ]

    def seed_genome(self):
        return {"margin": 0.05, "ceiling": 0.9, "window": 10, "explore": 0.1}

    def evaluate(self, genome, seeds):
        per_opponent = []
        wins = []
        for opponent in ZOO.values():
            results = [play(genome, opponent, s) for s in seeds]
            per_opponent.append(sum(p for p, _ in results) / len(results))
            wins.append(sum(w for _, w in results) / len(results))
        return {
            "profit_avg": sum(per_opponent) / len(per_opponent),
            "profit_worst": min(per_opponent),
            "win_rate": sum(wins) / len(wins),
            "memory": float(genome["window"]),
        }


PROBLEM = AuctionProblem()
