// Task 7.1 — spec ("OTP Verification State Sequence") + design D13 purity
// discipline (mirrors dni.ts exactly): a pure, I/O-free format check. It
// MUST run before any `verify_code` query effect — a failed check never
// emits one, it just re-prompts and does NOT burn an OTP attempt (design's
// FSM states table, `cita_awaiting_otp` row). The `/^[0-9]{4,8}$/` shape is
// a non-blocking open question (design's Open Questions) confined to this
// one file, exactly like isValidDniFormat's own fixed 8-digit assumption.

/** True iff `value` is 4 to 8 ASCII digits after trimming surrounding whitespace. */
export function isValidOtpFormat(value: string | undefined): boolean {
  return value !== undefined && /^[0-9]{4,8}$/.test(value.trim());
}
