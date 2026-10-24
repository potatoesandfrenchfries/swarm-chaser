import path from "node:path";
import type { LanguageAdapter } from "../core/types.js";
import { cAdapter } from "./c.js";
import { cppAdapter } from "./cpp.js";

/**
 * Register new languages here. Adding Rust, Zig or Verilog is one new file
 * implementing LanguageAdapter plus one line below. See docs/EXTENDING.md.
 */
export const adapters: LanguageAdapter[] = [cAdapter, cppAdapter];

export function adapterById(id: string): LanguageAdapter {
  const found = adapters.find((a) => a.id === id);
  if (!found) throw new Error(`Unknown language '${id}'. Supported: ${adapters.map((a) => a.id).join(", ")}`);
  return found;
}

/** Pick the adapter from an explicit id, else from source file extensions. */
export function chooseAdapter(language: string | undefined, sources: string[]): LanguageAdapter {
  if (language) return adapterById(language);
  const matches = new Set<LanguageAdapter>();
  for (const s of sources) {
    const ext = path.extname(s).toLowerCase();
    const a = adapters.find((x) => x.extensions.includes(ext));
    if (a) matches.add(a);
  }
  // A mixed C/C++ build must go through the C++ driver.
  if (matches.has(cppAdapter)) return cppAdapter;
  const [first] = matches;
  if (!first) throw new Error(`Cannot infer language from ${sources.join(", ") || "(no sources)"}. Pass \`language\` (${adapters.map((a) => a.id).join(", ")}).`);
  return first;
}
