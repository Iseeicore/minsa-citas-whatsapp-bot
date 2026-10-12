import { COMBINING_ACCENT_MARKS, STRETCHED_CHARACTER, WORD_SEPARATORS } from "@/lib/constants/regex/text";
import { EXIT_PATTERNS } from "@/lib/constants/regex/selection";

export function normalizeIntentPhrase(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_ACCENT_MARKS, "")
    .replace(STRETCHED_CHARACTER, "$1")
    .replace(WORD_SEPARATORS, " ")
    .trim();
}

export function detectExitIntent(text: string): boolean {
  const phrase = normalizeIntentPhrase(text);
  if (!phrase) return false;
  return EXIT_PATTERNS.some((pattern) => pattern.test(phrase));
}
