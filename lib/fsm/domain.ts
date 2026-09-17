export function isValidDniFormat(value: string): boolean {
  return /^\d{8}$/.test(value.trim());
}

export function isValidOtpFormat(value: string): boolean {
  return /^\d{4,8}$/.test(value.trim());
}

function normalizeName(value: string): Set<string> {
  const normalized = value
    .normalize("NFD")
    // Strip diacritics (combining marks) left behind by NFD decomposition.
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

  return new Set(normalized.split(/\s+/).filter(Boolean));
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
