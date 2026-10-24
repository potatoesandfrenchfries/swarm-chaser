# AGENTS.md

This is a [Flue](https://flueframework.com) project: agents are TypeScript functions.

## Layout

- `src/agents/`: agent modules. A module whose first line is the `'use agent'` directive exports agents. Every exported capitalized function is one, and the function name is its durable identity.
- `src/subagents/`: specialists a parent delegates to (`defineSubagent` + `useSubagent`).
- `src/tools/`: `defineTool` tools. Keys stay in this process; the browser never sees them.
- `src/skills/<name>/SKILL.md`: instructions loaded with `useSkill`.
- `src/app.ts`: the route map. Every agent is mounted here explicitly.
- `src/db.ts`: the persistence adapter for durable conversations.

## Commands

- `pnpm dev`: start the dev server on :5173.
- `pnpm build` then `pnpm start`: build `dist/server.mjs` and run it.
- `pnpm typecheck`: typecheck.
- `npx flue run src/agents/assistant.ts --message "Hi"`: run an agent locally, no server.
- `npx flue docs search <query>`: search the Flue docs (then `flue docs read <path>`).
- `npx flue add`: list blueprints for adding channels, sandboxes and databases.
