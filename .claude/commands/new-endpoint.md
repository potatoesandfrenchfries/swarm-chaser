---
description: |
  Add one FastAPI route with request and response schemas and a test.
when_to_use: |
  - User says "new endpoint", "new route" or "add an API for ..."
  - User names an endpoint from PLAN.md section 5 (GET /graph, POST /responses, /admin/graph/*, ...)
---

# New Endpoint

**Usage**: `/new-endpoint <METHOD> <path> [description]`

**Examples**:
- `/new-endpoint POST /responses Record a student's answer`
- `/new-endpoint GET /me/diagnose/{node_id} Weakest upstream node and reason`

**Endpoint**: $ARGUMENTS

## Step 1: Read

1. If `backend/` does not exist, stop and ask the user.
2. Check PLAN.md section 5 for the endpoint's contract and whether it is an admin route.
3. Read the router file this endpoint belongs in and one existing test.

## Step 2: Implement

- Add request and response models in `backend/schemas/`. Never return a table model directly.
- Put the logic in a service function or in `learner/` / `gating/`. The route only parses, calls and maps errors to status codes.
- Admin routes use `Depends(require_admin_key)`. Student routes use the pseudonymous student id dependency.
- Every graph-editing route runs the cycle check and returns the resulting graph.
- Responses that include mastery return `p`, `lo`, `hi` and `n_obs`, never only `p`.

## Step 3: Test

Use the `TestClient` with the in-memory database fixture. Cover the success path, a validation failure, and (for admin routes) a missing key returning 401 or 403.

## Step 4: Verify

Run `/verify`. Open `/docs` and confirm the schema reads sensibly. If the frontend consumes this endpoint, note that the generated TypeScript client needs regenerating.
