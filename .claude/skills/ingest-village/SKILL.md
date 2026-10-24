---
name: ingest-village
description: Load one slice of the AI Village export into the normalised message/memory table (MVP M2). Use when adapting src/ingest/village.py to the real dataset or running the join test.
---

# Ingest the village (M2)

Code: `src/ingest/village.py`. Test: `tests/test_ingest.py`.

## Steps

1. Confirm dataset access (M1). If it fails, stop and tell the user: MVP.md has a sandbox-only fallback.
2. Fetch a local copy with `temps_ideas/repos/slopvestigatorbench-aivillage/scripts/build_aivillage_data.py` (MIT) and print the real schema.
3. Rewrite `_row_from_message` and `_row_from_memory`. The field names in the file are placeholders, not the real columns.
4. Every row ends up as `message_id/memory_id, episode_id, agent, model, ts (ISO 8601), source ("chat"|"memory"), text`.
5. Run `join_report(messages, memories)` and record **pass or fail** for the memories-and-timeline join. If it fails, use chat only and drop the memory-versus-log check (MVP.md risks).
6. Pick a slice with at least three documented failures from the 96 seed findings (`final-findings.json`).
7. Write the rows to SQLite and agree the `messages` columns with whoever builds `extract` and `check`.

## Rules

- Follow `/pipeline-rules`.
- Do not paste real data into committed files beyond the tiny test fixture.
