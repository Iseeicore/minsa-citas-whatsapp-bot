import type { TurnNoteKind } from "@/lib/observability/events";

export type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export type LogSink = (level: LogLevel, line: string) => void;

export type TurnNote = {
  kind: TurnNoteKind;
  level?: "info" | "warn";
  detail?: Record<string, string | number | boolean>;
};

export type ExternalService = "minsa" | "reniec" | "gemini" | "quejas";
