# Technical spec

One paragraph: what it does and who it is for.

## Architecture

```
browser ── Next.js :3000 ──(/api/agents/* rewrite)──► Flue agent :5173
                                                         │
                                                         ├─ tools (APIs, keys stay here)
                                                         └─ subagents
```

## Data contracts

What each tool returns and what the UI reads from it. Keep the tool output
shape and the component that renders it next to each other in this doc.

## Cut line

What ships if time runs out, and what does not.
