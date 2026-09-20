// Everything that reaches a log line goes through here first. The rule is
// "log what helps to diagnose, never what identifies": a document number keeps
// its last four digits, tokens and free text disappear.

const SENSITIVE_KEY = /bearer|token|authorization|secret|password|api[_-]?key|twofa|otp|code$/i;
const DNI_KEY = /dni|documento/i;
// Long values that are never worth their size in a log.
const LENGTH_ONLY_KEYS = new Set(["citaOffered", "citaHorasDia", "citaHoraChoiceB", "initialMessageText"]);

const MAX_STRING = 200;
const MAX_DEPTH = 4;
const MAX_ITEMS = 20;

export const tail = (value: string): string => `...${value.slice(-4)}`;

export function maskDni(value: string): string {
  // Already masked (a snapshot is sanitized once by the trace and again by the
  // logger): masking it again would eat the four digits that are left.
  if (/^\*{4}\d{0,4}$/.test(value)) return value;
  const digits = value.replace(/\D/g, "");
  return digits.length > 4 ? `****${digits.slice(-4)}` : "****";
}

// A digit run of 7 or more (a DNI, a phone number, an OTP echoed back), a
// Bearer header and a JWT are hidden wherever they appear inside a string.
export function redactString(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[jwt]")
    .replace(/\d{7,}/g, (run) => `****${run.slice(-4)}`);
}

export function sanitizeValue(key: string, value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (SENSITIVE_KEY.test(key)) return "[redacted]";
  if (LENGTH_ONLY_KEYS.has(key)) return { length: String(value).length };
  if (DNI_KEY.test(key) && (typeof value === "string" || typeof value === "number")) return maskDni(String(value));

  if (typeof value === "string") {
    const clean = redactString(value);
    return clean.length > MAX_STRING ? `${clean.slice(0, MAX_STRING)}…` : clean;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return { name: value.name, message: redactString(value.message).slice(0, MAX_STRING) };
  if (depth >= MAX_DEPTH) return "[truncated]";

  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((item) => sanitizeValue(key, item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeValue(k, v, depth + 1)]),
    );
  }
  return String(value);
}

export function sanitizeSlots(slots: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(slots).map(([key, value]) => [key, sanitizeValue(key, value)]));
}

// What the citizen typed, only where it is safe to show a piece of it. An
// identity step (DNI, OTP, name) or a complaint is never quoted — only its length.
const NEVER_PREVIEW_STATE = /^(cita_awaiting_(dni|otp)|reclamo_)/;
const PREVIEW_CHARS = 40;

export function previewInput(state: string, text: string | undefined): Record<string, unknown> {
  if (text === undefined) return {};
  if (NEVER_PREVIEW_STATE.test(state)) return { inputLength: text.length };
  const flat = redactString(text.replace(/\s+/g, " ").trim());
  return {
    inputLength: text.length,
    inputPreview: flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS)}…` : flat,
  };
}
