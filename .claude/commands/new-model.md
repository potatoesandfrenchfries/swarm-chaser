---
description: |
  Create a SQLModel table and its Alembic migration.
when_to_use: |
  - User says "new model", "new table" or "add an entity" without wanting the full API slice
  - User names an entity from PLAN.md section 4 (Course, Book, Section, ConceptNode, Edge, Question, Response, ...)
---

# New Model

**Usage**: `/new-model <EntityName> [field:type ...]`

**Examples**:
- `/new-model Edge src_node:int dst_node:int type:str weight:int source:str`
- `/new-model Response student_id:str question_id:int correct:bool hints_used:int`

**Arguments**: $ARGUMENTS

## Step 1: Read existing context

1. If `backend/` does not exist, stop and ask the user (see PLAN.md section 3).
2. Read PLAN.md section 4. If the entity is listed, use its fields and relationships exactly, and use the argument list only to override.
3. Read one existing model in `backend/models/` and match its style.

## Step 2: Write the model

`backend/models/{entity}.py`:
- `class {Entity}(SQLModel, table=True)` with `__tablename__` in snake_case.
- Primary key `id`, foreign keys with `foreign_key="table.id"` and an index on any column that is filtered on.
- Enums as `str` enums stored as strings (portable to Postgres).
- JSON fields with `sa_column=Column(JSON)`. If a field will be filtered or sorted, make it a real column instead.
- LLM-derived rows carry `pipeline`, `model`, `prompt_version` and `run_id`. Rows a human can edit carry `source` (`'xref' | 'llm' | 'manual'`).

Export the model from `backend/models/__init__.py` so Alembic sees it.

## Step 3: Migration

1. Run `alembic revision --autogenerate -m "create {entity}"`.
2. **Read the generated file.** Autogenerate misses enums, server defaults and some constraints.
3. Run `alembic upgrade head` on an empty database, then `alembic downgrade -1`, then `upgrade head` again.

Never edit a migration that has been committed. Add a new one (`/new-migration`).

## Step 4: Verify

Run `/verify`. Add one test that inserts a row and reads it back.

Do not add the API layer here. Use `/new-endpoint` or `/new-feature` for that.
