export type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

// One line of NDJSON, plus the level it was written at (the level picks the
// console stream, so Vercel Logs shows it with the right severity).
export type LogSink = (level: LogLevel, line: string) => void;

// A decision or a friction point a pure handler wants on record. Handlers only
// return it as data (HandlerResult.notes); the turn executor is what logs it,
// so the finite-state machine itself never does I/O.
export type TurnNote = {
  kind: string;
  level?: "info" | "warn";
  detail?: Record<string, string | number | boolean>;
};

export type ExternalService = "minsa" | "reniec" | "gemini" | "quejas";
