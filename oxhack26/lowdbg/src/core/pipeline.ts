import { debuggerById } from "../debuggers/index.js";
import { chooseAdapter } from "../languages/index.js";
import type {
  BuildResult,
  Context,
  DebugResult,
  Finding,
  FindingKind,
  LanguageAdapter,
  RunResult,
} from "./types.js";
import { enrichFindings, enrichFrames, requireInRoot, relativeToRoot } from "./workspace.js";

/** Inputs shared by build / analyze / debug. Validated by the MCP layer. */
export interface ProgramInput {
  language?: string;
  sources: string[];
  flags: string[];
  profile?: string;
  buildCommand?: string;
  program?: string;
  args: string[];
  stdin?: string;
  env: Record<string, string>;
  timeoutSec?: number;
}

const RANK: Record<FindingKind, number> = {
  "compile-error": 0,
  "memory-error": 1,
  "data-race": 2,
  deadlock: 2,
  "undefined-behavior": 3,
  assertion: 4,
  crash: 4,
  timeout: 5,
  "memory-leak": 6,
  "static-analysis": 7,
  "compile-warning": 8,
};

export function rank(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}

export interface AnalyzeResult {
  adapter: LanguageAdapter;
  profile: string;
  build: BuildResult;
  run?: RunResult;
}

async function buildStep(ctx: Context, input: ProgramInput, adapter: LanguageAdapter, profile: string): Promise<BuildResult> {
  const build = await adapter.build(
    { sources: input.sources, flags: input.flags, profile, buildCommand: input.buildCommand, program: input.program },
    ctx,
  );
  enrichFindings(ctx, build.diagnostics, input.sources);
  return build;
}

export async function runBuild(ctx: Context, input: ProgramInput): Promise<{ adapter: LanguageAdapter; profile: string; build: BuildResult }> {
  const adapter = chooseAdapter(input.language, input.sources);
  const profile = input.profile ?? adapter.defaultAnalyzeProfile;
  return { adapter, profile, build: await buildStep(ctx, input, adapter, profile) };
}

export async function runAnalyze(ctx: Context, input: ProgramInput): Promise<AnalyzeResult> {
  const { adapter, profile, build } = await runBuild(ctx, input);
  if (!build.ok || !build.program) return { adapter, profile, build };
  const run = await adapter.run(
    {
      program: build.program,
      args: input.args,
      stdin: input.stdin,
      env: input.env,
      profile,
      timeoutMs: (input.timeoutSec ?? 20) * 1000,
    },
    ctx,
  );
  run.findings = rank(enrichFindings(ctx, run.findings, input.sources));
  return { adapter, profile, build, run };
}

export async function runStatic(ctx: Context, input: Pick<ProgramInput, "language" | "sources" | "flags">): Promise<{ adapter: LanguageAdapter; findings: Finding[] }> {
  const adapter = chooseAdapter(input.language, input.sources);
  if (!adapter.staticAnalyze) throw new Error(`Static analysis is not available for ${adapter.displayName}.`);
  const findings = await adapter.staticAnalyze({ sources: input.sources, flags: input.flags }, ctx);
  return { adapter, findings: rank(enrichFindings(ctx, findings, input.sources)) };
}

export interface DebugInput extends ProgramInput {
  breakpoints: { file: string; line: number; condition?: string }[];
  breakOnSanitizerError: boolean;
  commands: string[];
  maxStops: number;
  frameDepth?: number;
}

export interface DebugOutcome {
  adapter: LanguageAdapter;
  profile: string;
  build?: BuildResult;
  debuggerName: string;
  result?: DebugResult;
}

export async function runDebug(ctx: Context, input: DebugInput): Promise<DebugOutcome> {
  const prebuilt = input.sources.length === 0 && !input.buildCommand && input.program;
  const adapter = chooseAdapter(input.language, input.sources.length ? input.sources : input.program ? [input.program] : []);
  const profile = input.profile ?? adapter.defaultDebugProfile;

  let build: BuildResult | undefined;
  let program: string;
  if (prebuilt) {
    program = requireInRoot(ctx, input.program!);
  } else {
    build = await buildStep(ctx, input, adapter, profile);
    if (!build.ok || !build.program) return { adapter, profile, build, debuggerName: "-" };
    program = build.program;
  }

  let backend;
  for (const id of adapter.debuggers) {
    const candidate = debuggerById(id);
    if (candidate && (await candidate.available()).available) {
      backend = candidate;
      break;
    }
  }
  if (!backend) throw new Error(`No debugger available for ${adapter.displayName} (wanted one of: ${adapter.debuggers.join(", ")}).`);

  const functionBreakpoints = input.breakOnSanitizerError ? (adapter.hasSanitizerBreakpoint?.(profile) ?? []) : [];
  const result = await backend.run({
    program,
    args: input.args,
    cwd: ctx.root,
    env: input.env,
    stdin: input.stdin,
    breakpoints: input.breakpoints.map((b) => ({ ...b, file: relativeToRoot(ctx, requireInRoot(ctx, b.file)) })),
    functionBreakpoints,
    commands: input.commands,
    maxStops: input.maxStops,
    frameDepth: input.frameDepth ?? (functionBreakpoints.length > 0 ? 8 : 4),
    timeoutMs: (input.timeoutSec ?? 60) * 1000,
  });
  for (const stop of result.stops) enrichFrames(ctx, stop.frames, input.sources);
  return { adapter, profile, build, debuggerName: backend.displayName, result };
}
