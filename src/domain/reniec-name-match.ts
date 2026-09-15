// Spec (identity-verification / RENIEC Word-Set Name Match) + design's
// exact algorithm, replicated from the reference Twilio implementation:
// word-set containment, NOT equality, NOT fuzzy/edit-distance matching.
// Pure comparison logic only — this module never calls RENIEC itself; it
// takes already-fetched RENIEC data as input (the lookup client is a
// separate port, out of scope here).

/**
 * Structural shape matching the future `ReniecPerson` port type (same three
 * fields) — kept local so this pure comparison module has zero dependency
 * on the `ReniecLookupClient` port, which is built in a later work unit.
 */
export interface ReniecFullName {
  readonly nombres: string;
  readonly apellidoPaterno: string;
  readonly apellidoMaterno: string;
}

const DIACRITICS_PATTERN = /[̀-ͯ]/g;
const NON_ALPHANUMERIC_PATTERN = /[^A-Z0-9]+/g;

/** Accent-insensitive, uppercased, whitespace-split tokens (Ñ folds to N via NFD + diacritic strip). */
export function normalizeNameTokens(value: string): readonly string[] {
  return value
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "")
    .toUpperCase()
    .replace(NON_ALPHANUMERIC_PATTERN, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length > 0);
}

/**
 * Word-set containment: every token the citizen typed must appear in the
 * official RENIEC name (order-independent). Known weakness, deliberately
 * preserved per design: a single correct first name matches — no minimum-
 * token rule is added, to replicate the reference implementation exactly
 * rather than silently tightening who passes verification.
 */
export function namesMatch(input: string, official: ReniecFullName): boolean {
  const provided = new Set(normalizeNameTokens(input));
  if (provided.size === 0) return false;

  const officialTokens = new Set(
    normalizeNameTokens(`${official.nombres} ${official.apellidoPaterno} ${official.apellidoMaterno}`)
  );

  return [...provided].every((token) => officialTokens.has(token));
}
