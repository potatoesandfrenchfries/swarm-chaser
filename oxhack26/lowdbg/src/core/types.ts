/**
 * Language-agnostic vocabulary. Everything a language adapter or debugger
 * backend produces is normalised into these types so the MCP layer, the
 * snippet enrichment and the formatter never need to know which language or
 * tool a result came from.
 */

export type FindingKind =
  | "compile-error"
  | "compile-warning"
  | "static-analysis"
  | "memory-error"
  | "undefined-behavior"
  | "memory-leak"
  | "data-race"
  | "deadlock"
  | "crash"
  | "assertion"
  | "timeout";

export interface Frame {
  index?: number;
  function?: string;
  /** Path as reported by the tool; rewritten relative to the root once known to be user code. */
  file?: string;
  line?: number;
  column?: number;
  module?: string;
  /** Set by enrichment: the file resolves inside the workspace root. */
  inUserCode?: boolean;
}

/** A labelled secondary stack, e.g. "freed by" or "previous write". */
export interface Section {
  label: string;
  frames: Frame[];
}

/** One step of an analyzer's explanation path ("Assuming 'p' is null"). */
export interface TraceStep {
  message: string;
  file?: string;
  line?: number;
  column?: number;
}

export interface Finding {
  kind: FindingKind;
  severity: "error" | "warning";
  /** Tool that produced it: asan, ubsan, tsan, lsan, clang, clang-analyzer, runtime. */
  source: string;
  title: string;
  detail?: string;
  frames: Frame[];
  sections: Section[];
  trace: TraceStep[];
  /** First frame inside the workspace: where to look first. */
  primary?: Frame;
  /** Numbered source lines around `primary`. */
  snippet?: string;
}

export interface ExecResult {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
}

export interface Context {
  /** Real path of the workspace root. All file access is confined to it. */
  root: string;
}

export interface ProfileInfo {
  id: string;
  description: string;
}

export interface ToolInfo {
  name: string;
  available: boolean;
  version?: string;
  note?: string;
}

export interface BuildRequest {
  /** Source files relative to root (or absolute inside it). */
  sources: string[];
  /** Extra compiler flags: -std=, -I, -D, -l ... */
  flags: string[];
  profile: string;
  /** Run this with `sh -c` instead of compiling `sources` directly. Requires `program`. */
  buildCommand?: string;
  /** Path of the produced executable when using `buildCommand`. */
  program?: string;
}

export interface BuildResult {
  ok: boolean;
  command: string;
  /** Path to the executable, absolute. */
  program?: string;
  diagnostics: Finding[];
  /** Raw tail of build output when nothing could be parsed. */
  rawTail?: string;
}

export interface RunRequest {
  program: string;
  args: string[];
  stdin?: string;
  env: Record<string, string>;
  profile: string;
  timeoutMs: number;
}

export interface RunResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
  stdoutTail: string;
  stderrTail: string;
  findings: Finding[];
}

export interface StaticRequest {
  sources: string[];
  flags: string[];
}

/**
 * The extension point for a new language. Implement this, register it in
 * `languages/index.ts`, and every MCP tool works for the new language.
 */
export interface LanguageAdapter {
  readonly id: string;
  readonly displayName: string;
  /** Lower-case, with leading dot. Used to auto-detect the adapter from `sources`. */
  readonly extensions: string[];
  readonly profiles: ProfileInfo[];
  /** Profile used by `analyze` when none is given. */
  readonly defaultAnalyzeProfile: string;
  /** Profile used by `debug` when none is given. */
  readonly defaultDebugProfile: string;
  /** Language-specific advice appended to the workflow prompt. */
  readonly guidance: string;
  /** Debugger backend ids in order of preference. */
  readonly debuggers: string[];

  toolchain(ctx: Context): Promise<ToolInfo[]>;
  build(req: BuildRequest, ctx: Context): Promise<BuildResult>;
  run(req: RunRequest, ctx: Context): Promise<RunResult>;
  /** Optional: analysis that needs no execution. */
  staticAnalyze?(req: StaticRequest, ctx: Context): Promise<Finding[]>;
  /** Whether the profile makes sanitizer failures reachable by a debugger breakpoint. */
  hasSanitizerBreakpoint?(profile: string): string[];
}

export interface Breakpoint {
  file: string;
  line: number;
  condition?: string;
}

export interface DebugRequest {
  program: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  stdin?: string;
  breakpoints: Breakpoint[];
  /** Function-name breakpoints, e.g. `__asan_on_error` to stop at a sanitizer report. */
  functionBreakpoints: string[];
  /** Raw debugger commands run at every stop: `p *ptr`, `x/16xb buf`, `watchpoint set variable n`. */
  commands: string[];
  maxStops: number;
  frameDepth: number;
  timeoutMs: number;
}

export interface Variable {
  name: string;
  type: string;
  value: string;
}

export interface DebugFrame extends Frame {
  variables: Variable[];
}

export interface Stop {
  reason: string;
  frames: DebugFrame[];
  commandOutputs: { command: string; output: string }[];
}

export interface DebugResult {
  stops: Stop[];
  exited?: { code?: number; signal?: string };
  timedOut: boolean;
  /** Problems worth surfacing, e.g. a breakpoint that resolved to no location. */
  warnings: string[];
  /** Truncated debugger transcript, kept for anything the structured parse missed. */
  transcriptTail: string;
}

/** The extension point for a new debugger (gdb, a DAP client, ...). */
export interface DebuggerBackend {
  readonly id: string;
  readonly displayName: string;
  available(): Promise<ToolInfo>;
  run(req: DebugRequest): Promise<DebugResult>;
}
