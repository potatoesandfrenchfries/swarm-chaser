# h-template

Starting points for hackathon projects. Each folder is self-contained: copy it
out, `pnpm install`, and follow its README. [COMPONENTS.md](./COMPONENTS.md) is the
longer map for coding agents.

| Folder                                      | What it is                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [frontend/](./frontend)                     | Event site: landing page, registration, dashboard, two themes                                  |
| [chatbot/](./chatbot)                       | Local-first chat UI that talks straight to a model provider; no backend                        |
| [agent-app/](./agent-app)                   | Flue agent server + Next.js chat UI: tools, subagents, durable conversations                   |
| [research-agent/](./research-agent)         | LangGraph research pipeline on Supabase: web + document search, cited claims, verified report  |
| [companion-dashboard/](./companion-dashboard) | Supervisor-routed agent graph with two role views (the person, and whoever looks after them) |
| [live-game/](./live-game)                   | Host-driven live quiz on PartyKit: rooms, phases, server-side scoring                          |
| [saas-starter/](./saas-starter)             | Sign-in, Postgres, one-off Stripe payments, rate limits and security headers                   |
| [mcp-council/](./mcp-council)               | MCP server that makes an agent's plan survive isolated critique, debate and a vote             |
| [map-sim/](./map-sim)                       | What-if simulator for a network on a map: add a node, see who gets faster or slower            |
| [claims-ledger/](./claims-ledger)           | Watch what organizations say, verify quotes word for word, test them against records           |
| [evolve-harness/](./evolve-harness)         | Evolutionary tuning loop: mutate, test against a zoo, keep the Pareto frontier, resume          |
| [agent-skills/](./agent-skills)             | One store of agent skills, symlinked into Claude Code, Codex, Cursor and seven other tools     |

Which to start from:

- **A chat product with tools or several agents:** `agent-app`.
- **An agent that reads documents and writes a sourced report:** `research-agent`.
- **An agent with a human supervisor watching:** `companion-dashboard`.
- **Anything real-time and multiplayer:** `live-game`.
- **Users, a database and something to charge for:** `saas-starter`.
- **An agent that should justify a plan before acting:** `mcp-council`.
- **"What if we added this?" on a network or a map:** `map-sim`.
- **Monitoring what people or companies claim over time:** `claims-ledger`.
- **Tuning a bot or strategy overnight:** `evolve-harness`.
- **Your own machine's setup, before the event:** `agent-skills`.
