import { STRETCHED_CHARACTER, WORD_SEPARATORS } from "@/lib/constants/regex/text";
import { EXIT_PATTERNS } from "@/lib/constants/regex/selection";
import { stripAccents } from "@/lib/utils/text-values";

export function normalizeIntentPhrase(text: string): string {
  return stripAccents(text.toLowerCase()).replace(STRETCHED_CHARACTER, "$1").replace(WORD_SEPARATORS, " ").trim();
}

export function detectExitIntent(text: string): boolean {
  const phrase = normalizeIntentPhrase(text);
  if (!phrase) return false;
  return EXIT_PATTERNS.some((pattern) => pattern.test(phrase));
}
