import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "./log.js";
import { freshMember } from "./members.js";
import type { DecisionRecord, MemberDefinition, MemberState } from "./schemas.js";

export type CouncilEvent =
  | { type: "phase"; phase: string }
  | { type: "position"; member: string; vote: string }
  | { type: "vote"; member: string; vote: string; defected: boolean }
  | { type: "verdict"; winner: string; confidence: number }
  | { type: "reaper"; eliminated: string; replacement: string };

interface Persisted {
  members: MemberState[];
  history: DecisionRecord[];
  counter: number;
}

/**
 * The council's memory: who sits on it, how each member has done, and every
 * decision. Saved to one JSON file so a restart (or a new chat) keeps the track
 * record that the verdict weights and the reaper depend on.
 */
export class CouncilState {
  members: MemberState[];
  history: DecisionRecord[] = [];
  counter = 0;
  private listeners = new Set<(event: CouncilEvent) => void>();
  private readonly file: string | null;

  constructor(definitions: MemberDefinition[], stateDir: string | null) {
    this.members = definitions.map(freshMember);
    this.file = stateDir ? join(stateDir, "state.json") : null;
    if (stateDir) mkdirSync(stateDir, { recursive: true });
    this.load(definitions);
  }

  /** Subscribe to progress events: the hook for a UI, a log file, or MCP progress notifications. */
  onEvent(listener: (event: CouncilEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: CouncilEvent) {
    for (const listener of this.listeners) listener(event);
  }

  nextId() {
    this.counter += 1;
    return `decision-${String(this.counter).padStart(3, "0")}`;
  }

  record(decision: DecisionRecord) {
    this.history.push(decision);
    this.save();
  }

  save() {
    if (!this.file) return;
    const data: Persisted = { members: this.members, history: this.history, counter: this.counter };
    // Write to a temp file and rename, so a crash mid-write cannot leave half a file.
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, this.file);
  }

  private load(definitions: MemberDefinition[]) {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, "utf-8")) as Persisted;
      // Only trust saved members whose names are still on the roster, so editing
      // the members file takes effect instead of being shadowed by old state.
      const names = new Set(definitions.map((d) => d.name));
      const kept = saved.members.filter((m) => names.has(m.definition.name));
      this.members = definitions.map(
        (d) => kept.find((m) => m.definition.name === d.name) ?? freshMember(d)
      );
      this.history = saved.history;
      this.counter = saved.counter;
    } catch (error) {
      log("Could not read saved state, starting fresh:", error);
    }
  }
}
