# Ideas from RL research talks

Ideas we could borrow from an RL and agents reading group, for the HRT challenge:
**best use of data for predictions and decision making**.

Summaries come from search-result abstracts, not the full papers. Read the paper
before building on any claim here. These are RL methods, not datasets, so each
idea needs a real dataset behind it (see [DATASETS.md](./DATASETS.md)) to answer
the challenge.

## Papers

| Talk | Paper | Fit |
| --- | --- | --- |
| Chalumeau (InstaDeep) | [Breaking the Performance Ceiling in RL requires Inference Strategies](https://arxiv.org/pdf/2505.21236), NeurIPS 2025 | High |
| Schäfer | [When does predictive inverse dynamics outperform behavior cloning?](https://arxiv.org/html/2601.21718v1), ICML 2026 | High |
| Beukman | [Preventing Learning Stagnation in PPO by Scaling to 1 Million Parallel Environments](https://arxiv.org/abs/2603.06009v1), RLC 2026 | Medium |
| Mon-Williams | [Partner Modelling Emerges in Recurrent Agents (But Only When It Matters)](https://arxiv.org/pdf/2505.17323), NeurIPS 2025 | Medium |
| Assistax authors | [Assistax](https://arxiv.org/pdf/2507.21638), RLJ 2026 | Medium |
| Tenedini & Zamboni | [From Parameters to Behaviors](https://arxiv.org/html/2509.22566v2) (closest match; the talk title differs) | Low to medium |
| Steleac | [Inter-Agent Relative Representations for Multi-Agent Option Discovery](https://arxiv.org/pdf/2512.24827), ICLR 2026 | Low |
| Théo Vincent | No paper found for the talk title. His work is on autonomous learning built on temporal-difference methods ([profile](https://www.ias.informatik.tu-darmstadt.de/Team/TheoVincent)). | Unknown |

The Schäfer talk title (Uncertainty Reduction at a Price) did not match any
paper exactly. The ICML paper above matches its claim.

## Ideas we could use

### 1. Inference-time search instead of retraining (Chalumeau)

- **Claim:** a fully trained policy plateaus, but a short search over a latent
  space of behaviours (COMPASS) goes past the plateau. Reported gains: 45% on
  average, up to 126%, across 17 environments, with seconds of extra compute.
  Code and data from 60k+ experiments are released.
- **Use for us:** a fast pre-trained model proposes, then a short search picks the
  best option for current conditions. Applies to any forecast-then-decide
  problem, such as battery scheduling, delivery routing or rebalancing.
- **Pitch:** better decisions in seconds, with no retraining.
- **Evaluate:** plain model against model plus search, same compute budget, walk-forward by time.
- **To check:** whether the released code is easy to reuse outside combinatorial optimisation.

### 2. Few-sample prediction with predictive inverse dynamics (Schäfer)

- **Claim:** predicting the future state first adds bias but reduces variance, so
  it needs fewer demonstrations than behaviour cloning. In a 3D game, cloning
  needed over 66% more samples. The gap widens when extra data sources exist.
- **Use for us:** when the labelled dataset is small, predict the next state, then
  pick the action. Fits any project learning from limited expert or historical decisions.
- **Pitch:** a sample-efficiency curve (performance against amount of data) is a
  clear data-use story, and the bias-variance explanation is easy to present.
- **Evaluate:** learning curves for both approaches as the training set shrinks.

### 3. Partner modelling (Mon-Williams)

- **Claim:** simple recurrent agents infer a partner's ability from behaviour
  alone, with no dedicated module, but only when the task makes it matter.
  Blind recurrent agents averaged 9.43 soups against 1.08 for a memoryless
  network in Overcooked.
- **Use for us:** infer a hidden trait of another actor (a user, a driver, a
  collaborator) from its behaviour history, then adapt the decision.
- **Pitch:** the result shows when this is worth doing, which is the useful
  engineering lesson.
- **Evaluate:** probe the hidden state for the trait, and compare against a
  memoryless baseline.

### 4. Parallel-scale training with matched hyperparameters (Beukman)

- **Claim:** PPO plateaus because sampled loss estimates become poor stand-ins for
  the true objective. Scaling to over a million parallel environments, with
  hyperparameters co-scaled, keeps improving up to a trillion steps. Scaling
  incorrectly degrades performance.
- **Use for us:** only if we have GPU budget and a fast simulator. Otherwise just
  keep the lesson: when training stalls, suspect noisy estimates before
  capacity or exploration, and try a smaller outer step size.
- **Risk:** compute-heavy; hard to show in a weekend.

### 5. Ready-made assistive-robotics environment (Assistax)

- **Claim:** JAX and MuJoCo MJX benchmark with a robot and a human-like partner,
  up to 370x faster than CPU alternatives, pre-trained partners, and a
  zero-shot coordination test. Code: `assistive-autonomy/assistax`.
- **Use for us:** a simulator we do not have to build, if the project involves
  robotics, assistance or human-AI teamwork.
- **Risk:** it is a benchmark, so there is no real dataset; pairing it with real
  data would take extra work.

### 6. Latent behaviour spaces (Tenedini & Zamboni)

- **Claim:** compress the redundant parameter space of policies into a
  low-dimensional latent space of behaviours, then solve tasks in that space.
- **Use for us:** the same latent-space idea underlies idea 1. Worth reading
  only if we pursue that route.
- **Risk:** needs significant infrastructure; probably too much for a hackathon.

### 7. Coordinated multi-agent options (Steleac)

- **Claim:** options for teams can be derived from how agent states synchronise,
  using a "Fermat state" of maximal team alignment.
- **Use for us:** only if the project is multi-agent coordination.
- **Risk:** theory-heavy and tied to specific simulated domains.

## What fits the challenge best

Ideas 1 and 2 are the portable ones:

- **Idea 1:** inference-time search on a forecast-and-decide problem. Strongest overall.
- **Idea 2:** a small-data learning-curve comparison. Easy to run and present.

They combine: use idea 2 to learn well from limited data, then idea 1 to refine
decisions at run time.

The papers alone are methods demos. The project needs a dataset with a
prediction target, a decision and a cost, chosen from DATASETS.md.

## Next steps

1. Read the Chalumeau and Schäfer papers in full and check their released code.
2. Pick one dataset from DATASETS.md with a clear decision cost.
3. Define the baseline (plain model) and the improvement (search, or predictive inverse dynamics).
4. Write the evaluation plan before building.
