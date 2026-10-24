---
name: branch-naming
description: Branch naming convention, M<x>-<purpose> where x is the epic (MVP milestone) number. Use before creating, renaming or pushing a branch, or when reviewing a branch name.
---

# Branch naming

Format: `M<x>-<purpose>`

- `x` is the epic number, the milestone in `MVP.md` (M1 to M13). Example: M3 is claim extraction, M4 is the checker.
- `purpose` is a short kebab-case phrase: lowercase, hyphens, no spaces, a few words.
- Keep the capital `M`. Do not zero-pad the number (`M3`, not `M03`).

Examples:

- `M3-second-prompt-variant`
- `M4-vendor-agreement`
- `M12-documented-cases`
- `M9-pilot-scoring`

## Rules

- One branch per epic-sized piece of work. Work that touches several epics goes on the branch of the main one; do not invent a combined name.
- If the work belongs to no epic, ask the user which `M<x>` it falls under before creating the branch. Do not make up a prefix like `fix-` or `feature/`.
- Branch from an up-to-date `main` unless the user says otherwise: `git switch main && git pull && git switch -c M<x>-<purpose>`.
- Never commit straight to `main`. If on `main` with changes to commit, create the branch first.
- Renaming: `git branch -m <old> M<x>-<purpose>`. If it was already pushed, tell the user before changing the remote name.

## Checking a name

A name is valid if it matches `^M[1-9][0-9]*-[a-z0-9]+(-[a-z0-9]+)*$`.
