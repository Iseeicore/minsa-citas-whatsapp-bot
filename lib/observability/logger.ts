import { currentTraceId } from "@/lib/observability/context";
import { createDailyFileSink } from "@/lib/observability/file-sink";
import { sanitizeValue } from "@/lib/observability/mask";
import type { LogFields, LogLevel, LogSink } from "@/lib/observability/types";

const RANK: Record<LogLevel | "silent", number> = { info: 1, warn: 2, error: 3, silent: 4 };

export type Logger = {
  info: (event: string, fields?: LogFields) => void;
  warn: (event: string, fields?: LogFields) => void;
  error: (event: string, fields?: LogFields) => void;
};

export function createLogger(options: {
  sink: LogSink;
  level?: LogLevel | "silent";
  now?: () => Date;
  traceId?: () => string | undefined;
}): Logger {
  const threshold = RANK[options.level ?? "info"];
  const now = options.now ?? (() => new Date());
  const traceId = options.traceId ?? currentTraceId;

  const write = (level: LogLevel, event: string, fields: LogFields = {}): void => {
    if (RANK[level] < threshold) return;
    try {
      const record: Record<string, unknown> = { time: now().toISOString(), level, event };
      const id = traceId();
      if (id) record.traceId = id;
      for (const [key, value] of Object.entries(fields)) record[key] = sanitizeValue(key, value);
      options.sink(level, JSON.stringify(record));
    } catch {
    }
  };

  return {
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
  };
}

const consoleSink: LogSink = (level, line) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
};

function envLevel(): LogLevel | "silent" {
  const requested = process.env.LOG_LEVEL?.toLowerCase();
  if (requested === "info" || requested === "warn" || requested === "error" || requested === "silent") return requested;
  return process.env.NODE_ENV === "test" ? "silent" : "info";
}

function defaultSink(): LogSink {
  if (process.env.LOG_TO_FILE !== "true" || (process.env.VERCEL && !process.env.LOG_DIR)) return consoleSink;

  const file = createDailyFileSink({ dir: process.env.LOG_DIR || "logs" });
  return (level, line) => {
    consoleSink(level, line);
    file(level, line);
  };
}

let current = createLogger({ sink: defaultSink(), level: envLevel() });

export const logger: Logger = {
  info: (event, fields) => current.info(event, fields),
  warn: (event, fields) => current.warn(event, fields),
  error: (event, fields) => current.error(event, fields),
};

export function configureLogger(options: { sink: LogSink; level?: LogLevel | "silent" }): () => void {
  const previous = current;
  current = createLogger(options);
  return () => {
    current = previous;
  };
}
