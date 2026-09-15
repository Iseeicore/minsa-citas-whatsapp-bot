// Spec (identity-verification / DNI Format Validation) + design D-numbered
// decisions carried forward from Stage A's purity discipline (D13): this is
// a pure, I/O-free format check. It MUST run before any RENIEC call — it
// never performs one itself, and a failed check means the caller never
// emits a `reniec_lookup` effect.

/** True iff `value` is exactly 8 ASCII digits after trimming surrounding whitespace. */
export function isValidDniFormat(value: string | undefined): boolean {
  return value !== undefined && /^[0-9]{8}$/.test(value.trim());
}
