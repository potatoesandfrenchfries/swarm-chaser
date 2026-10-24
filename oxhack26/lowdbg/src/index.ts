#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { openWorkspace } from "./core/workspace.js";
import { createServer } from "./server.js";

function rootFromArgs(argv: string[]): string {
  const i = argv.indexOf("--root");
  if (i >= 0 && argv[i + 1]) return argv[i + 1]!;
  return process.env.LOWDBG_ROOT ?? process.cwd();
}

const ctx = openWorkspace(rootFromArgs(process.argv.slice(2)));
// stdout is the protocol channel; all diagnostics go to stderr.
console.error(`lowdbg: workspace root ${ctx.root}`);
await createServer(ctx).connect(new StdioServerTransport());
