---
description: |
  Create or update a deterministic seed script: a sample course, concept graph, questions and a synthetic student cohort.
when_to_use: |
  - User says "seed data", "sample data", "fake students" or "synthetic cohort"
  - User needs data to see the map or the professor board working
---

# Seed Data

**Usage**: `/seed-data [students=N] [nodes=N] [questions=N]`

**Example**: `/seed-data students=60 nodes=10 questions=80`

**Arguments**: $ARGUMENTS (defaults: 60 students, 10 nodes, 80 questions)

## Step 1: Read

1. If `backend/` does not exist, stop and ask the user. The frontend's static data in `src/data/` is the only seed that exists until then.
2. Read PLAN.md section 4 for the entities to seed, and any existing `backend/seed.py`.

## Step 2: Write `backend/seed.py`

Run as `python -m backend.seed`. It must be **deterministic**: take a `--seed` argument (default fixed) and use one `numpy.random.Generator`.

Seed in this order:
1. One course, one main book, its sections and concept nodes (kebab-case ids, a mix of required and optional edges forming a DAG).
2. Questions per node with a type, a difficulty prior and tags (at most 3 per question). Mark all as `approved`.
3. Synthetic students with **known** true parameters (`p_init`, `p_learn`, `guess`, `slip`) stored so results can be checked against truth. Include a few students with one deliberately weak prerequisite, so "why am I stuck?" has a known right answer.
4. Responses generated from those parameters, first attempts only counted, with plausible `hints_used` and `latency_ms`.

Include a deliberate share of non-participants (students with no responses) so dashboards are tested against missing data, not just clean data.

## Step 3: Idempotence

Running it twice must not duplicate rows. Either wipe the seeded tables first or key rows by a stable id. Never touch rows with `source = 'manual'`.

## Step 4: Verify

Run the script on an empty database, then again. Print row counts per table. Run `/verify`.

State clearly in the output that this is synthetic data, so it is never mistaken for a pilot result.
