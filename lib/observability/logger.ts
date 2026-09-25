import { currentTraceId } from "@/lib/observability/context";
import { createDailyFileSink } from "@/lib/observability/file-sink";
import { sanitizeValue } from "@/lib/observability/mask";
import type { LogFields, LogLevel, LogSink } from "@/lib/observability/types";

// Structured logging as one JSON object per line (NDJSON), written with the
// console so Vercel Logs and any log shipper read it as is. No dependency: a
// line is one JSON.stringify and one console call, nothing that waits.
//
//   { "time": "...", "level": "warn", "event": "turn.note", "traceId": "t-…", ... }
//
// Every field goes through sanitizeValue, so a DNI, a token or a phone number
// cannot reach a line even if a caller forgets to hide it.

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
      // Observability must never be the reason a turn fails.
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

// stdout always; a daily folder on disk too when LOG_TO_FILE=true (LOG_DIR,
// "logs" by default). On Vercel a disk copy is pointless, so it needs an
// explicit LOG_DIR there.
function defaultSink(): LogSink {
  if (process.env.LOG_TO_FILE !== "true" || (process.env.VERCEL && !process.env.LOG_DIR)) return consoleSink;

  // `||`, not `??`: an empty LOG_DIR (as a copied .env.example leaves it) means "logs" too.
  const file = createDailyFileSink({ dir: process.env.LOG_DIR || "logs" });
  return (level, line) => {
    consoleSink(level, line);
    file(level, line);
  };
}

let current = createLogger({ sink: defaultSink(), level: envLevel() });

// The logger the app uses. Kept behind a forwarding object so tests can swap the
// sink without every module having to re-import it.
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
