type Level = "debug" | "info" | "warn" | "error";

const COLOURS: Record<Level, string> = {
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

function write(level: Level, message: string, meta?: Record<string, unknown>, error?: unknown) {
  const production = process.env.NODE_ENV === "production";
  if (production && level === "debug") return;

  const err =
    error instanceof Error
      ? { name: error.name, message: error.message, ...(production ? {} : { stack: error.stack }) }
      : error;

  if (production) {
    // One JSON object per line, for log aggregators.
    console.log(JSON.stringify({ level, message, time: new Date().toISOString(), meta, error: err }));
  } else {
    console.log(`${COLOURS[level]}[${level.toUpperCase()}]\x1b[0m ${message}`, meta ?? "", err ?? "");
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>, error?: unknown) => write("warn", message, meta, error),
  error: (message: string, meta?: Record<string, unknown>, error?: unknown) => write("error", message, meta, error),
};
