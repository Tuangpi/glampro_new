import { env } from "./env.js";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const threshold = LEVEL_WEIGHT[(env.logLevel as Level) ?? "info"] ?? LEVEL_WEIGHT.info;

type Meta = Record<string, unknown>;

/**
 * Dependency-free structured logger.
 *
 * Production emits one JSON object per line (easy to ship to a log collector).
 * Development prints a readable single line. Nothing here writes to a file —
 * the container runtime already captures stdout.
 */
function emit(level: Level, message: string, meta?: Meta): void {
  if (LEVEL_WEIGHT[level] < threshold) return;

  const timestamp = new Date().toISOString();

  if (env.isProduction) {
    const line = JSON.stringify({ timestamp, level, message, ...meta });
    console[level === "debug" ? "log" : level](line);
    return;
  }

  const suffix = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta, replacer)}` : "";
  const label = level.toUpperCase().padEnd(5);
  const stream = level === "error" || level === "warn" ? console.error : console.log;
  stream(`${timestamp} ${label} ${message}${suffix}`);
}

/** `Error` is not JSON-serialisable, so flatten it into `name`/`message`/`stack`. */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export const logger = {
  debug: (message: string, meta?: Meta) => emit("debug", message, meta),
  info: (message: string, meta?: Meta) => emit("info", message, meta),
  warn: (message: string, meta?: Meta) => emit("warn", message, meta),
  error: (message: string, meta?: Meta) => emit("error", message, meta),
};
