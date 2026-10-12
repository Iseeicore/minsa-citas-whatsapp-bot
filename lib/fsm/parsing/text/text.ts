import {
  ALL_WHITESPACE_RUNS,
  CAPITALIZED_CONNECTOR,
  COMBINING_ACCENT_MARKS,
  WHITESPACE_RUN,
  WORD_INITIAL,
} from "@/lib/constants/regex/text";

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_ACCENT_MARKS, "")
    .toUpperCase()
    .trim()
    .replace(ALL_WHITESPACE_RUNS, " ");
}

export function toDisplayPlace(name: string): string {
  return name
    .toLowerCase()
    .replace(WORD_INITIAL, (_match, separator: string, letter: string) => separator + letter.toUpperCase())
    .replace(CAPITALIZED_CONNECTOR, (word) => word.toLowerCase());
}

function normalizeName(value: string): Set<string> {
  return new Set(normalizeText(value).split(WHITESPACE_RUN).filter(Boolean));
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
