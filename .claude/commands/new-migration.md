---
description: |
  Alter an existing table safely with an Alembic migration (add column, add index, rename, change type).
when_to_use: |
  - User says "add a column", "alter the schema", "new migration" or "change the table"
---

# New Migration (alter existing schema)

**Usage**: `/new-migration <change description>`

**Examples**:
- `/new-migration add chosen_option to response`
- `/new-migration add index on question_tag(node_id)`

**Change**: $ARGUMENTS

## Step 1: Read

1. Find the model that owns the table and the latest file in `backend/migrations/versions/`.
2. Check whether the change affects anything that reads or writes the column (services, schemas, tests, seed data). List them.

## Step 2: Change the model first

Edit the SQLModel class, then run `alembic revision --autogenerate -m "{short description}"`.

**Read the generated file before keeping it.** Check:
- A new `NOT NULL` column on a table with rows needs a default or a nullable-then-backfill step.
- SQLite cannot alter most constraints in place. Use `op.batch_alter_table(...)`.
- Enum and server-default changes are often missed by autogenerate.
- The downgrade actually reverses the upgrade.

## Step 3: Update dependents

Update the Pydantic schemas, service code, the seed script and the tests you listed in Step 1.

## Step 4: Verify

Apply to a fresh database, then to a copy that already has seed data. Run `alembic downgrade -1` and `alembic upgrade head`. Then run `/verify`.

Never edit a migration that has already been committed. Always add a new one.
