import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { baseEnv, exec, tail, which } from "../core/exec.js";
import type { DebugFrame, DebugRequest, DebugResult, DebuggerBackend, Stop, ToolInfo, Variable } from "../core/types.js";

/** Full paths and no backtick (a backtick starts expression evaluation in lldb's command line). */
const FRAME_FORMAT =
  "frame #${frame.index}: ${frame.pc} ${module.file.basename} {${function.name-with-args}}{ at ${line.file.fullpath}:${line.number}{:${line.column}}}\\n";

function quote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

interface Script {
  /** Main command sequence (`-o`). Abandoned by lldb if the inferior crashes. */
  commands: string[];
  /** Run instead when the inferior crashes (`-k`); lldb skips the remaining `-o` commands then. */
  crashCommands: string[];
  /** Contents of the per-stop inspection file sourced by both of the above. */
  block: string;
  /** Commands we generated, so everything else in a stop group is a user command. */
  internal: Set<string>;
}

/**
 * Two lldb batch-mode behaviours shape this script:
 *  1. A failing command aborts the rest of an `-o` sequence, so the per-stop inspection (which
 *     may select frames that do not exist) runs via `command source -e false`, which continues.
 *  2. If the inferior crashes, the remaining `-o` commands are dropped; the same inspection is
 *     therefore also registered as a crash handler.
 */
export function buildScript(req: DebugRequest, files: { stdinFile?: string; blockFile: string }): Script {
  const internal = new Set<string>();
  const commands: string[] = [];
  const add = (cmd: string) => {
    commands.push(cmd);
    internal.add(cmd);
  };

  // Not quote()d: the format's single backslash-n must reach lldb unmodified.
  add(`settings set frame-format "${FRAME_FORMAT}"`);
  add("settings set stop-line-count-before 0");
  add("settings set stop-line-count-after 0");
  add("settings set stop-disassembly-count 0");
  for (const [k, v] of Object.entries(req.env)) add(`settings append target.env-vars ${quote(`${k}=${v}`)}`);

  for (const bp of req.breakpoints) {
    const cond = bp.condition ? ` --condition ${quote(bp.condition)}` : "";
    add(`breakpoint set --file ${quote(bp.file)} --line ${bp.line}${cond}`);
  }
  for (const fn of req.functionBreakpoints) add(`breakpoint set --name ${quote(fn)}`);

  const launch = [`process launch -w ${quote(req.cwd)}`];
  if (files.stdinFile) launch.push(`-i ${quote(files.stdinFile)}`);
  if (req.args.length > 0) launch.push(`-- ${req.args.map(quote).join(" ")}`);
  add(launch.join(" "));

  const source = `command source -e false -s false ${quote(files.blockFile)}`;
  internal.add(source);
  for (let stop = 0; stop < req.maxStops; stop++) {
    if (stop > 0) add("continue");
    commands.push(source);
  }
  add("process kill");
  add("quit");

  const block: string[] = [];
  const inBlock = (cmd: string, isInternal = true) => {
    block.push(cmd);
    if (isInternal) internal.add(cmd);
  };
  inBlock(`thread backtrace -c ${req.frameDepth + 4}`);
  for (let f = 0; f < req.frameDepth; f++) {
    inBlock(`frame select ${f}`);
    inBlock("frame variable");
  }
  inBlock("frame select 0");
  for (const c of req.commands) inBlock(c, false);

  return { commands, crashCommands: [source, "process kill", "quit"], block: `${block.join("\n")}\n`, internal };
}

export interface Section {
  command: string;
  output: string;
}

/** lldb --batch echoes every command as `(lldb) <command>`; split the transcript on those. */
export function splitTranscript(text: string): Section[] {
  const sections: Section[] = [];
  let current: { command: string; lines: string[] } | undefined;
  for (const line of text.split(/\r?\n/)) {
    const m = /^\(lldb\) (.*)$/.exec(line);
    if (m) {
      if (current) sections.push({ command: current.command, output: current.lines.join("\n").trim() });
      current = { command: m[1]!, lines: [] };
    } else {
      current?.lines.push(line);
    }
  }
  if (current) sections.push({ command: current.command, output: current.lines.join("\n").trim() });
  return sections;
}

const FRAME_LINE = /^\s*\*?\s*frame #(\d+): (0x[0-9a-f]+) (\S+) ?(.*?)(?: at (\S+?):(\d+)(?::(\d+))?)?\s*$/;

export function parseBacktrace(output: string): DebugFrame[] {
  const frames: DebugFrame[] = [];
  for (const line of output.split("\n")) {
    const m = FRAME_LINE.exec(line);
    if (!m) continue;
    const frame: DebugFrame = { index: Number(m[1]), module: m[3], variables: [] };
    const fn = m[4]!.trim();
    if (fn) frame.function = fn;
    if (m[5]) {
      frame.file = m[5];
      frame.line = Number(m[6]);
      if (m[7]) frame.column = Number(m[7]);
    }
    frames.push(frame);
  }
  return frames;
}

/** `frame variable` prints `(type) name = value`; struct values span several lines. */
export function parseVariables(output: string): Variable[] {
  const vars: Variable[] = [];
  for (const line of output.split("\n")) {
    const m = /^\((.+?)\) (\S+) = (.*)$/.exec(line);
    if (m) vars.push({ type: m[1]!, name: m[2]!, value: m[3]! });
    else if (vars.length > 0 && line.trim()) vars[vars.length - 1]!.value += `\n${line}`;
  }
  return vars;
}

const isLaunch = (c: string) => /^(process launch|run)\b/.test(c);
const isContinue = (c: string) => /^(continue|process continue)$/.test(c);

export function parseTranscript(text: string, internal: Set<string>): Omit<DebugResult, "timedOut" | "transcriptTail"> {
  const sections = splitTranscript(text);
  const stops: Stop[] = [];
  const warnings: string[] = [];
  let exited: DebugResult["exited"];
  let group: { launchOutput: string; sections: Section[] } | undefined;
  const groups: NonNullable<typeof group>[] = [];

  for (const s of sections) {
    if (isLaunch(s.command) || isContinue(s.command)) {
      group = { launchOutput: s.output, sections: [] };
      groups.push(group);
    } else if (group) {
      group.sections.push(s);
    } else if (/^breakpoint set/.test(s.command) && /no locations \(pending\)|WARNING:/.test(s.output)) {
      warnings.push(`'${s.command}' did not resolve to any location (wrong file/line, or no debug info): ${s.output.split("\n")[0]}`);
    }
  }

  for (const g of groups) {
    const exit = /Process \d+ exited with status = (-?\d+)/.exec(g.launchOutput);
    const reason = /stop reason = (.+)$/m.exec(g.launchOutput);
    if (!reason) {
      if (exit && !/killed/.test(g.launchOutput)) exited = { code: Number(exit[1]) };
      continue;
    }

    const stop: Stop = { reason: reason[1]!.trim(), frames: [], commandOutputs: [] };
    let selected = 0;
    for (const s of g.sections) {
      if (/^thread backtrace/.test(s.command)) {
        stop.frames = parseBacktrace(s.output);
      } else if (/^frame select \d+$/.test(s.command)) {
        selected = Number(s.command.split(" ")[2]);
      } else if (s.command === "frame variable") {
        const frame = stop.frames.find((f) => f.index === selected);
        if (frame) frame.variables = parseVariables(s.output);
      } else if (!internal.has(s.command)) {
        stop.commandOutputs.push({ command: s.command, output: s.output });
      }
    }
    stops.push(stop);
  }
  return { stops, exited, warnings };
}

export class LldbBackend implements DebuggerBackend {
  readonly id = "lldb";
  readonly displayName = "LLDB";

  async available(): Promise<ToolInfo> {
    const bin = await which("lldb");
    if (!bin) return { name: "lldb", available: false, note: "not on PATH (install Xcode Command Line Tools or LLVM)" };
    const v = await exec(bin, ["--version"], { cwd: process.cwd(), timeoutMs: 15_000 });
    return { name: "lldb", available: true, version: v.stdout.split("\n")[0] };
  }

  async run(req: DebugRequest): Promise<DebugResult> {
    const bin = await which("lldb");
    if (!bin) throw new Error("lldb not found on PATH.");

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lowdbg-"));
    try {
      let stdinFile: string | undefined;
      if (req.stdin !== undefined) {
        stdinFile = path.join(tmp, "stdin.txt");
        fs.writeFileSync(stdinFile, req.stdin);
      }
      const blockFile = path.join(tmp, "inspect.lldb");
      const script = buildScript(req, { stdinFile, blockFile });
      fs.writeFileSync(blockFile, script.block);

      const args = [
        "--batch",
        "--no-lldbinit",
        ...script.commands.flatMap((c) => ["-o", c]),
        ...script.crashCommands.flatMap((c) => ["-k", c]),
        req.program,
      ];
      const r = await exec(bin, args, { cwd: req.cwd, env: baseEnv(), timeoutMs: req.timeoutMs });
      const parsed = parseTranscript(r.stdout, script.internal);
      return { ...parsed, timedOut: r.timedOut, transcriptTail: tail(`${r.stdout}\n${r.stderr}`.trim(), 3000) };
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
}
