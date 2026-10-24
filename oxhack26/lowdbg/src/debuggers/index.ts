import type { DebuggerBackend } from "../core/types.js";
import { LldbBackend } from "./lldb.js";

/** Register new debuggers (gdb, a DAP client, rr, ...) here. */
export const debuggers: DebuggerBackend[] = [new LldbBackend()];

export function debuggerById(id: string): DebuggerBackend | undefined {
  return debuggers.find((d) => d.id === id);
}
