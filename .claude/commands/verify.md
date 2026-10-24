---
description: |
  Run lint, tests and build for everything that exists, and report plainly.
when_to_use: |
  - User says "verify", "check everything" or "does it pass"
  - After finishing a change, before saying it is done
---

# Verify

Run the checks below for the parts of the repo that exist. Skip a part that does not exist and say so.

## Frontend (repo root)

```bash
npm run lint
npm run build
```

Add `npm test` only if a test script exists in package.json.

## Backend (only if `backend/` exists)

```bash
cd backend && ruff check .
cd backend && ruff format --check .
cd backend && pytest -q
```

If an Alembic setup exists, also apply migrations to a temporary empty SQLite database and confirm they run to `head`.

## Report

Give a short result per check: passed, failed or skipped (and why). For a failure, quote the relevant output and say what you think caused it. Do not claim something passes without having run it. If a check could not run, say that, do not infer a pass.

Do not fix failures unless the user asked. Offer the fix instead.
