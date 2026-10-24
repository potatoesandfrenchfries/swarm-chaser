import fs from "node:fs";
import path from "node:path";
import { baseEnv, exec, tail, which } from "../core/exec.js";
import { ensureScratchDir, relativeToRoot, requireInRoot } from "../core/workspace.js";
import type {
  BuildRequest,
  BuildResult,
  Context,
  Finding,
  LanguageAdapter,
  ProfileInfo,
  RunRequest,
  RunResult,
  StaticRequest,
  ToolInfo,
} from "../core/types.js";
import { crashFromSignal, parseAssertion } from "../parsers/crash.js";
import { parseDiagnostics, parseLinkerError } from "../parsers/diagnostics.js";
import { parseSanitizerOutput } from "../parsers/sanitizers.js";

export interface ClangFamilyConfig {
  id: string;
  displayName: string;
  extensions: string[];
  /** Env var that overrides the compiler (CC, CXX). */
  compilerEnv: string;
  /** Compiler executables to try, in order. */
  compilers: string[];
  /** Variable names for command-mode builds. */
  flagsEnv: string;
  guidance: string;
}

const PROFILE_FLAGS: Record<string, string[]> = {
  "asan-ubsan": ["-g", "-O0", "-fno-omit-frame-pointer", "-fsanitize=address,undefined"],
  tsan: ["-g", "-O1", "-fno-omit-frame-pointer", "-fsanitize=thread"],
  debug: ["-g", "-O0", "-fno-omit-frame-pointer"],
  optimized: ["-g", "-O2", "-fno-omit-frame-pointer"],
};

const PROFILES: ProfileInfo[] = [
  { id: "asan-ubsan", description: "AddressSanitizer + UndefinedBehaviorSanitizer, -O0 -g. Finds heap/stack/global overflows, use-after-free, double free, signed overflow, bad shifts, null deref. Default for analyze." },
  { id: "tsan", description: "ThreadSanitizer, -O1 -g. Finds data races and lock-order inversions. Cannot be combined with asan." },
  { id: "debug", description: "Plain -O0 -g, no instrumentation. Best for stepping and inspecting a crash in a debugger. Default for debug." },
  { id: "optimized", description: "Plain -O2 -g. Use to reproduce bugs that only appear with optimization (usually undefined behavior)." },
];

function sanitizerEnv(profile: string): Record<string, string> {
  const linux = process.platform === "linux";
  switch (profile) {
    case "asan-ubsan":
      return {
        ASAN_OPTIONS: `detect_stack_use_after_return=1:symbolize=1:print_summary=1${linux ? ":detect_leaks=1" : ""}`,
        UBSAN_OPTIONS: "print_stacktrace=1:print_summary=1",
      };
    case "tsan":
      return { TSAN_OPTIONS: "second_deadlock_stack=1:report_signal_unsafe=0" };
    default:
      return {};
  }
}

export class ClangFamilyAdapter implements LanguageAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly extensions: string[];
  readonly profiles = PROFILES;
  readonly defaultAnalyzeProfile = "asan-ubsan";
  readonly defaultDebugProfile = "debug";
  readonly debuggers = ["lldb"];
  readonly guidance: string;

  private compilerCache: Promise<string | undefined> | undefined;
  private profileSupport = new Map<string, Promise<boolean>>();

  constructor(private readonly cfg: ClangFamilyConfig) {
    this.id = cfg.id;
    this.displayName = cfg.displayName;
    this.extensions = cfg.extensions;
    this.guidance = cfg.guidance;
  }

  hasSanitizerBreakpoint(profile: string): string[] {
    return profile === "asan-ubsan" ? ["__asan_on_error"] : [];
  }

  private compiler(): Promise<string | undefined> {
    this.compilerCache ??= (async () => {
      const fromEnv = process.env[this.cfg.compilerEnv];
      const candidates = fromEnv ? [fromEnv, ...this.cfg.compilers] : this.cfg.compilers;
      for (const c of candidates) {
        const found = await which(c);
        if (found) return found;
      }
      return undefined;
    })();
    return this.compilerCache;
  }

  private async requireCompiler(): Promise<string> {
    const cc = await this.compiler();
    if (!cc) throw new Error(`No ${this.displayName} compiler found (tried ${this.cfg.compilers.join(", ")}).`);
    return cc;
  }

  private supports(profile: string, ctx: Context): Promise<boolean> {
    let cached = this.profileSupport.get(profile);
    if (!cached) {
      cached = (async () => {
        const cc = await this.compiler();
        const flags = PROFILE_FLAGS[profile];
        if (!cc || !flags) return false;
        const dir = ensureScratchDir(ctx, "probe");
        const src = path.join(dir, `probe${this.extensions[0]}`);
        fs.writeFileSync(src, "int main(void) { return 0; }\n");
        const r = await exec(cc, [...flags, src, "-o", path.join(dir, `probe-${profile}`)], { cwd: ctx.root, timeoutMs: 60_000 });
        return r.code === 0;
      })();
      this.profileSupport.set(profile, cached);
    }
    return cached;
  }

  async toolchain(ctx: Context): Promise<ToolInfo[]> {
    const cc = await this.compiler();
    const info: ToolInfo[] = [];
    if (!cc) return [{ name: this.cfg.compilers[0]!, available: false, note: "no compiler found" }];
    const v = await exec(cc, ["--version"], { cwd: ctx.root, timeoutMs: 10_000 });
    info.push({ name: path.basename(cc), available: true, version: v.stdout.split("\n")[0] });
    for (const p of this.profiles) {
      const ok = await this.supports(p.id, ctx);
      info.push({ name: `profile:${p.id}`, available: ok, note: ok ? undefined : "compiler cannot build with these flags" });
    }
    if (process.platform !== "linux") {
      info.push({ name: "leak-detection", available: false, note: "LeakSanitizer is not available on this platform; leaks will not be reported" });
    }
    return info;
  }

  private sourceArgs(sources: string[], ctx: Context): string[] {
    return sources.map((s) => relativeToRoot(ctx, requireInRoot(ctx, s)));
  }

  async build(req: BuildRequest, ctx: Context): Promise<BuildResult> {
    const cc = await this.requireCompiler();
    const profileFlags = PROFILE_FLAGS[req.profile];
    if (!profileFlags) throw new Error(`Unknown profile '${req.profile}'. Available: ${this.profiles.map((p) => p.id).join(", ")}`);
    if (!(await this.supports(req.profile, ctx))) {
      throw new Error(`Profile '${req.profile}' is not supported by ${path.basename(cc)} on this machine. Try profile 'debug'.`);
    }

    const outDir = ensureScratchDir(ctx, "build", req.profile);
    let result: { command: string; stderr: string; stdout: string; code: number | null; program: string };

    if (req.buildCommand) {
      if (!req.program) throw new Error("`program` (path of the built executable) is required with `buildCommand`.");
      const program = requireInRoot(ctx, req.program);
      const flags = [...profileFlags, ...req.flags].join(" ");
      const env = baseEnv({
        [this.cfg.compilerEnv]: cc,
        [this.cfg.flagsEnv]: flags,
        LDFLAGS: profileFlags.filter((f) => f.startsWith("-fsanitize")).join(" "),
      });
      const r = await exec("/bin/sh", ["-c", req.buildCommand], { cwd: ctx.root, env, timeoutMs: 300_000 });
      result = { command: req.buildCommand, stderr: r.stderr, stdout: r.stdout, code: r.code, program };
    } else {
      if (req.sources.length === 0) throw new Error("`sources` must list at least one file (or pass `buildCommand`).");
      const sources = this.sourceArgs(req.sources, ctx);
      const name = path.basename(sources[0]!, path.extname(sources[0]!));
      const program = path.join(outDir, name);
      const args = [...profileFlags, "-Wall", "-Wextra", ...req.flags, ...sources, "-o", program];
      const r = await exec(cc, args, { cwd: ctx.root, timeoutMs: 300_000 });
      result = { command: [path.basename(cc), ...args].join(" "), stderr: r.stderr, stdout: r.stdout, code: r.code, program };
    }

    const text = `${result.stderr}\n${result.stdout}`;
    const diagnostics = parseDiagnostics(text, { source: path.basename(cc), errorKind: "compile-error", warningKind: "compile-warning" });
    const ok = result.code === 0 && fs.existsSync(result.program);
    if (!ok) {
      const linker = parseLinkerError(text);
      if (linker) diagnostics.push(linker);
    }
    const hasError = diagnostics.some((d) => d.severity === "error");
    return {
      ok,
      command: result.command,
      program: ok ? result.program : undefined,
      diagnostics,
      rawTail: !ok && !hasError ? tail(text.trim(), 3000) : undefined,
    };
  }

  async run(req: RunRequest, ctx: Context): Promise<RunResult> {
    const program = requireInRoot(ctx, req.program);
    const env = baseEnv({ ...sanitizerEnv(req.profile), ...req.env });
    const r = await exec(program, req.args, {
      cwd: ctx.root,
      env,
      stdin: req.stdin,
      timeoutMs: req.timeoutMs,
    });

    const findings: Finding[] = parseSanitizerOutput(r.stderr);
    if (findings.length === 0) {
      const assertion = parseAssertion(r.stderr);
      if (assertion) findings.push(assertion);
    }
    if (findings.length === 0 && r.signal && !r.timedOut) findings.push(crashFromSignal(r.signal));
    if (r.timedOut) {
      findings.push({
        kind: "timeout",
        severity: "error",
        source: "runtime",
        title: `Program did not finish within ${Math.round(req.timeoutMs / 1000)}s`,
        detail: "Likely an infinite loop, a deadlock, or it is waiting on stdin. Use the debug tool with a breakpoint, or pass `stdin`.",
        frames: [],
        sections: [],
        trace: [],
      });
    }

    return {
      exitCode: r.code,
      signal: r.signal,
      timedOut: r.timedOut,
      durationMs: r.durationMs,
      stdoutTail: tail(r.stdout, 2000),
      stderrTail: tail(r.stderr, 2000),
      findings,
    };
  }

  async staticAnalyze(req: StaticRequest, ctx: Context): Promise<Finding[]> {
    const cc = await this.requireCompiler();
    const sources = this.sourceArgs(req.sources, ctx);
    const isClang = /clang/.test(path.basename(cc)) || (await exec(cc, ["--version"], { cwd: ctx.root, timeoutMs: 10_000 })).stdout.includes("clang");
    const mode = isClang ? ["--analyze", "-Xclang", "-analyzer-output=text"] : ["-fanalyzer", "-c", "-o", "/dev/null"];
    const r = await exec(cc, [...mode, "-Wall", ...req.flags, ...sources], { cwd: ctx.root, timeoutMs: 300_000 });
    const text = `${r.stderr}\n${r.stdout}`;
    const found = parseDiagnostics(text, { source: isClang ? "clang-analyzer" : "gcc-analyzer", errorKind: "compile-error", warningKind: "static-analysis" });
    // Plain compiler warnings are the build tool's business; keep analyzer reports and hard errors.
    return found.filter((f) => f.kind === "compile-error" || /\[(?:core|unix|cplusplus|security|deadcode|nullability|optin)\.[\w.]+\]|\[-Wanalyzer/.test(f.title));
  }
}
