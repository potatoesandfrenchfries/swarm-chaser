// Adapted from Dialogia (MIT, (c) 2025 Francesco La Rosa):
// https://github.com/larosafrancesco289/dialogia (see LICENSE-dialogia).
// Module: agent/streaming/accumulator
// Responsibility: Batch streaming deltas into small UI-friendly flushes.

export type StreamAccumulatorConfig = {
  /** Delay before a normal batched flush. Keep low so streaming still feels live. */
  flushIntervalMs?: number;
  /** Flush immediately once the pending text reaches this size. */
  maxBufferedChars?: number;
  /** Flush line endings immediately so lists/code blocks feel responsive. */
  flushOnNewline?: boolean;
};

const DEFAULT_CONFIG: Required<StreamAccumulatorConfig> = {
  flushIntervalMs: 32,
  maxBufferedChars: 512,
  flushOnNewline: true,
};

export function createStreamAccumulator(
  onFlush: (text: string) => void,
  config?: StreamAccumulatorConfig
) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let buffer = "";
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let frameId: number | null = null;

  const clearScheduled = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (frameId != null) {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frameId);
      }
      frameId = null;
    }
  };

  const flush = () => {
    clearScheduled();
    if (!buffer) return;
    const text = buffer;
    buffer = "";
    onFlush(text);
  };

  const schedule = () => {
    if (timeoutId || frameId != null) return;
    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (typeof requestAnimationFrame === "function") {
        frameId = requestAnimationFrame(() => {
          frameId = null;
          flush();
        });
      } else {
        flush();
      }
    }, cfg.flushIntervalMs);
  };

  const shouldFlushNow = (text: string) =>
    buffer.length >= cfg.maxBufferedChars ||
    (cfg.flushOnNewline && text.includes("\n"));

  return {
    push(text: string) {
      if (!text) return;
      buffer += text;
      if (shouldFlushNow(text)) {
        flush();
      } else {
        schedule();
      }
    },
    flush,
    cancel() {
      clearScheduled();
      buffer = "";
    },
    get bufferSize() {
      return buffer.length;
    },
  };
}
