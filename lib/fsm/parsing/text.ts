export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function toDisplayPlace(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s(-])(\p{L})/gu, (_match, separator: string, letter: string) => separator + letter.toUpperCase())
    .replace(/(?<=\s)(De|Del|La|Las|Los|Y)(?=\s|$)/g, (word) => word.toLowerCase());
}

function normalizeName(value: string): Set<string> {
  return new Set(normalizeText(value).split(/\s+/).filter(Boolean));
}

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
