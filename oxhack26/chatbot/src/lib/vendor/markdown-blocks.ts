// Adapted from Dialogia (MIT, (c) 2025 Francesco La Rosa):
// https://github.com/larosafrancesco289/dialogia (see LICENSE-dialogia).
// Module: markdown/blocks
// Responsibility: Split streaming markdown into stable, independently renderable
// blocks plus a trailing in-progress block, so the UI can memoize completed
// blocks and only re-parse the tail on each stream flush.

// CommonMark fences: an opener is three or more of one character (a backtick
// opener's info string holds no backtick); only a run of the same character,
// at least as long, with nothing after it, closes it.
const FENCE_OPEN_RE = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
// Lines that continue a construct from the previous segment (lists, quotes,
// tables, indented code, a list item's own later paragraphs). Splitting before
// these could change list numbering or break tables, so such segments are
// merged into the previous block. Merging is always safe: a bigger block only
// parses closer to how the whole document does.
const CONTINUATION_RE = /^(?:[ \t]+\S| {0,3}(?:[-*+] |\d{1,9}[.)] |>|\|))/;
// `$$`, `\[` or `\]` alone on a line fences display maths (see preprocess).
const MATH_FENCE_RE = /^ {0,3}(?:\$\$|\\\[|\\\])\s*$/;

export type MarkdownBlockSplit = {
  /** Completed blocks whose content will never change as the stream grows. */
  stable: string[];
  /** The in-progress trailing block (may be empty). */
  tail: string;
};

/**
 * Split markdown into blocks at blank lines outside fenced code, preserving
 * the original text exactly (stable.join('') + tail === content). The final
 * segment is always returned as the tail since it may still be growing.
 */
export function splitMarkdownBlocks(content: string): MarkdownBlockSplit {
  if (!content) return { stable: [], tail: "" };

  const segments: string[] = [];
  let current = "";
  let inFence = false;
  let fenceMarker = "";
  let inMathFence = false;

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const isLast = i === lines.length - 1;
    const withNewline = isLast ? line : `${line}\n`;

    if (inFence) {
      current += withNewline;
      const close = line.match(FENCE_CLOSE_RE);
      if (
        close &&
        close[1]![0] === fenceMarker[0] &&
        close[1]!.length >= fenceMarker.length
      ) {
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }

    const open = line.match(FENCE_OPEN_RE);
    if (open) {
      current += withNewline;
      inFence = true;
      fenceMarker = open[1]!;
      continue;
    }

    if (MATH_FENCE_RE.test(line)) {
      current += withNewline;
      inMathFence = !inMathFence;
      continue;
    }
    if (inMathFence) {
      current += withNewline;
      continue;
    }

    if (line.trim() === "" && current.trim() !== "") {
      // Blank line ends the current block; trailing blank lines stay attached
      // to it so concatenation reproduces the source exactly.
      current += withNewline;
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() === "") {
        current += j === lines.length - 1 ? lines[j]! : `${lines[j]!}\n`;
        j += 1;
      }
      i = j - 1;
      segments.push(current);
      current = "";
      continue;
    }

    current += withNewline;
  }
  if (current) segments.push(current);

  // Merge continuation-looking segments so loose lists, tables, and quotes
  // stay within a single parse unit.
  const merged: string[] = [];
  for (const segment of segments) {
    const firstLine = segment.replace(/^\n+/, "").split("\n", 1)[0] ?? "";
    if (merged.length > 0 && CONTINUATION_RE.test(firstLine)) {
      merged[merged.length - 1] += segment;
    } else {
      merged.push(segment);
    }
  }

  const tail = merged.pop() ?? "";
  return { stable: merged, tail };
}

/**
 * The blocks a reply renders as, in order, the tail last. A block's index is
 * its render key, so a block keeps its key as the stream grows past it, when
 * the tail turns into a completed block, and when the stream ends: React
 * reuses what it already rendered instead of rebuilding the reply.
 */
export function markdownRenderBlocks(
  content: string,
  streaming = false
): string[] {
  const { stable, tail } = splitMarkdownBlocks(content);
  const shown = streaming
    ? withInlineMarksClosed(withoutPartialFenceClose(withoutOpenMath(tail)))
    : tail;
  return shown ? [...stable, shown] : stable;
}

/**
 * Display maths half written does not parse, so KaTeX would flip between the
 * formula and its raw source on every flush, moving everything below it. An
 * open maths block waits until its closing line arrives.
 */
function withoutOpenMath(tail: string): string {
  let fence = "";
  let mathStart = -1;
  let offset = 0;
  for (const line of tail.split("\n")) {
    if (fence) {
      const close = line.match(FENCE_CLOSE_RE);
      if (
        close &&
        close[1]![0] === fence[0] &&
        close[1]!.length >= fence.length
      )
        fence = "";
    } else if (MATH_FENCE_RE.test(line)) {
      mathStart = mathStart < 0 ? offset : -1;
    } else if (mathStart < 0) {
      fence = line.match(FENCE_OPEN_RE)?.[1] ?? "";
    }
    offset += line.length + 1;
  }
  return mathStart < 0 ? tail : tail.slice(0, mathStart);
}

/** The fence still open after `lines`, or '' when none is. */
function openFence(lines: string[]): string {
  let marker = "";
  for (const line of lines) {
    if (!marker) {
      marker = line.match(FENCE_OPEN_RE)?.[1] ?? "";
      continue;
    }
    const close = line.match(FENCE_CLOSE_RE);
    if (
      close &&
      close[1]![0] === marker[0] &&
      close[1]!.length >= marker.length
    )
      marker = "";
  }
  return marker;
}

/**
 * While a reply streams, `**bold` shows its asterisks until the closing pair
 * arrives, and an opener with nothing after it yet (`with **`) shows on its
 * own. On the tail's last line, a dangling run of asterisks is held back and
 * an open code span, emphasis or strong is closed, so the words show styled
 * from their first letter. Code blocks, indented code and anything with maths
 * are left alone, as are asterisks that cannot open emphasis (a bullet,
 * `a * b`, `2*3`).
 */
function withInlineMarksClosed(tail: string): string {
  const lastBreak = tail.lastIndexOf("\n");
  const head = tail.slice(0, lastBreak + 1);
  let line = tail.slice(lastBreak + 1);
  if (!/[*`]/.test(line) || /[$\\]/.test(tail) || /^( {4}|\t)/.test(line))
    return tail;
  if (openFence(tail.split("\n"))) return tail;

  // A backtick that opens nothing yet waits; an open code span is closed.
  const ticks = (line.match(/`/g) ?? []).length;
  if (ticks % 2 && line.endsWith("`")) line = line.slice(0, -1);
  const codeOpen = (line.match(/`/g) ?? []).length % 2 === 1;
  let marks = codeOpen ? line.slice(0, line.lastIndexOf("`")) : line;
  marks = marks
    .replace(/`[^`]*`/g, "")
    .replace(/(^|\s)\*+(?=\s|$)/g, "$1")
    .replace(/(?<=[A-Za-z0-9])\*+(?=[A-Za-z0-9])/g, "");

  if (!codeOpen) {
    const trailing = line.match(/\*+$/)?.[0] ?? "";
    // An opener with nothing after it, or a closer still arriving.
    const opener = trailing && /(^|\s)\*+$/.test(line);
    const odd = (marks.match(/\*/g) ?? []).length % 2 === 1;
    if (trailing && (opener || odd)) {
      line = line.slice(0, -trailing.length);
      if (!opener) marks = marks.slice(0, -trailing.length);
    }
  }
  const strong = (marks.match(/\*\*/g) ?? []).length % 2 === 1;
  const em = (marks.replace(/\*\*/g, "").match(/\*/g) ?? []).length % 2 === 1;
  return `${head}${line}${codeOpen ? "`" : ""}${em ? "*" : ""}${strong ? "**" : ""}`;
}

/**
 * While a reply streams, the closing fence of a code block arrives a
 * character or two at a time, and each partial run would show as one more
 * code line until the fence completes, making the block grow and then
 * shrink. A last line that could still become the open fence's close is
 * held back.
 */
function withoutPartialFenceClose(tail: string): string {
  const lastBreak = tail.lastIndexOf("\n");
  const last = tail.slice(lastBreak + 1);
  if (lastBreak < 0 || !/^ {0,3}(`+|~+)$/.test(last)) return tail;
  const marker = openFence(tail.slice(0, lastBreak).split("\n"));
  return marker && last.trim()[0] === marker[0]
    ? tail.slice(0, lastBreak + 1)
    : tail;
}

// A link reference or footnote definition: `[id]: url`, `[^1]: text`.
const DEFINITION_RE = /^ {0,3}\[[^\]\n]+\]:/m;

/**
 * Whether rendering block by block reads the same as parsing the whole
 * document. A definition can be used from any other block, so a document
 * with one (or with a line that could be one, even inside code) must be
 * parsed whole once it is finished.
 */
export function rendersAsBlocks(content: string): boolean {
  return !DEFINITION_RE.test(content);
}
