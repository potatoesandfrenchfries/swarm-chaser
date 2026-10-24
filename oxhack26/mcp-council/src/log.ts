// An MCP server talks JSON-RPC over stdout, so anything else written there
// corrupts the protocol. All diagnostics go to stderr.
export const log = (...args: unknown[]) => console.error("[council]", ...args);
