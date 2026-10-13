import { SlotKey } from "@/lib/enums/slot-key";
import { ALL_WHITESPACE_RUNS } from "@/lib/constants/regex/text";
import {
  ALREADY_MASKED_DNI,
  BEARER_CREDENTIAL,
  DNI_KEY,
  JWT,
  LONG_DIGIT_RUN,
  NEVER_PREVIEW_STATE,
  NON_DIGIT,
  SENSITIVE_KEY,
  URL_WITH_QUERY_STRING,
} from "@/lib/constants/regex/observability";
import { isString } from "@/lib/utils/type-guards";

const LENGTH_ONLY_KEYS = new Set<string>([
  SlotKey.CITA_OFFERED,
  SlotKey.CITA_OFFERED_NAMES,
  SlotKey.CITA_HORAS_DIA,
  SlotKey.CITA_HORA_CHOICE_B,
  SlotKey.INITIAL_MESSAGE_TEXT,
]);

const MAX_STRING = 200;
const MAX_DEPTH = 4;
const MAX_ITEMS = 20;

export const tail = (value: string): string => `...${value.slice(-4)}`;

export function maskDni(value: string): string {
  if (ALREADY_MASKED_DNI.test(value)) return value;
  const digits = value.replace(NON_DIGIT, "");
  return digits.length > 4 ? `****${digits.slice(-4)}` : "****";
}

export function redactString(value: string): string {
  return value
    .replace(URL_WITH_QUERY_STRING, "$1?[redacted]")
    .replace(BEARER_CREDENTIAL, "Bearer [redacted]")
    .replace(JWT, "[jwt]")
    .replace(LONG_DIGIT_RUN, (run) => `****${run.slice(-4)}`);
}

export function sanitizeValue(key: string, value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (SENSITIVE_KEY.test(key)) return "[redacted]";
  if (LENGTH_ONLY_KEYS.has(key)) return { length: String(value).length };
  if (DNI_KEY.test(key) && (isString(value) || typeof value === "number")) return maskDni(String(value));

  if (isString(value)) {
    const clean = redactString(value);
    return clean.length > MAX_STRING ? `${clean.slice(0, MAX_STRING)}…` : clean;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return { name: value.name, message: redactString(value.message).slice(0, MAX_STRING) };
  if (depth >= MAX_DEPTH) return "[truncated]";

  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((item) => sanitizeValue(key, item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeValue(k, v, depth + 1)]));
  }
  return String(value);
}

export function sanitizeSlots(slots: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(slots).map(([key, value]) => [key, sanitizeValue(key, value)]));
}

const PREVIEW_CHARS = 40;

export function previewInput(state: string, text: string | undefined): Record<string, unknown> {
  if (text === undefined) return {};
  if (NEVER_PREVIEW_STATE.test(state)) return { inputLength: text.length };
  const flat = redactString(text.replace(ALL_WHITESPACE_RUNS, " ").trim());
  return {
    inputLength: text.length,
    inputPreview: flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS)}…` : flat,
  };
}
