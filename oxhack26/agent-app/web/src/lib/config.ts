export const APP = {
  name: "Agent app",
  tagline: "A Flue agent server with a Next.js chat UI.",
} as const;

/** The agents mounted in agent/src/app.ts. `prefix` namespaces session ids. */
export const AGENTS = {
  assistant: { label: "Assistant", prefix: "chat" },
  researcher: { label: "Researcher", prefix: "research" },
} as const;

export type AgentName = keyof typeof AGENTS;

/** The browser calls /api/agents/*; next.config.mjs rewrites it to Flue. */
export function agentUrl(agent: AgentName, sessionId: string) {
  return `/api/agents/${agent}/${sessionId}`;
}
