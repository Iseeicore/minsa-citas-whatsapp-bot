export function isValidDniFormat(value: string): boolean {
  return /^\d{8}$/.test(value.trim());
}

export function isValidOtpFormat(value: string): boolean {
  return /^\d{4,8}$/.test(value.trim());
}

// NFD-decompose + strip diacritics (the combining marks left behind by NFD)
// + uppercase — shared normalization used anywhere free-typed Spanish text
// needs to be compared against an official name (RENIEC full names here,
// UBIGEO district names in lib/fsm/ubigeo-data.ts).
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeName(value: string): Set<string> {
  return new Set(normalizeText(value).split(/\s+/).filter(Boolean));
}

// Word-set containment: the smaller name's tokens must all appear in the
// larger name's tokens (e.g. a single "Juan" typed by the user should match
// a RENIEC full name of "JUAN CARLOS QUISPE PEREZ").
export function namesMatch(typedName: string, officialFullName: string): boolean {
  const typedTokens = normalizeName(typedName);
  const officialTokens = normalizeName(officialFullName);

  if (typedTokens.size === 0 || officialTokens.size === 0) return false;

  const [smaller, larger] =
    typedTokens.size <= officialTokens.size
      ? [typedTokens, officialTokens]
      : [officialTokens, typedTokens];

  for (const token of smaller) {
    if (!larger.has(token)) return false;
  }

  return true;
}
