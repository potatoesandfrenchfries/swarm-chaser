---
description: |
  Add an ingestion or LLM pipeline stage with caching, provenance, a dry run and gold-set scoring.
when_to_use: |
  - User says "new pipeline stage", "add an ingestion step" or "add an LLM stage"
  - User names a stage from PLAN.md section 3 (edge classification, transcription, tagging, hint generation, ...)
---

# New Pipeline Stage

**Usage**: `/new-pipeline-stage <stage-name> [description]`

**Examples**:
- `/new-pipeline-stage hint-ladder Generate a 3-level hint ladder per question`
- `/new-pipeline-stage tagging Map questions to concept nodes`

**Stage**: $ARGUMENTS

## Step 1: Read

1. If `backend/llm/` does not exist, stop and ask the user. The provider interface comes first.
2. Read `backend/llm/base.py` and one existing stage. Match how it takes input, calls a provider, caches and writes rows.
3. Read the relevant section of PLAN.md (3, 5, 7) and check whether the stage has a Pipeline A and a Pipeline B variant.

## Step 2: Implement

- Define typed Pydantic input and output models for the stage.
- Define a `PROMPT_VERSION` constant. Changing the prompt means bumping it so the cache invalidates.
- Call the model only through the provider interface. Never import a vendor SDK in a stage.
- Cache key is `(stage, provider, model, prompt_version, sha256(input))`. A repeat run must make zero provider calls.
- Write rows with provenance: `pipeline`, `model`, `prompt_version`, `run_id`. Never overwrite a row with `source = 'manual'`.
- Add a confidence field to the output and route low-confidence items to the relevant review queue.
- Support `--dry-run`: count tokens and print an estimated cost, make no paid call.
- Respect the per-run budget cap. Abort when cumulative spend passes it.
- The run must be resumable. A killed run restarts without repeating completed calls.

## Step 3: Gold-set scoring

Add a function that scores the stage against `data/gold/` and prints the metric PLAN.md section 7 names for it (precision/recall, edit distance, tag accuracy). Add a test using a tiny fixture gold set.

## Step 4: Verify

Run `/verify`. Run the stage with `--dry-run` on a small sample and show the user the estimated cost.

**Do not run a paid call without the user's approval.** Show the dry-run estimate first.
