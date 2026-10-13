import { normalizeIntentPhrase } from "@/lib/fsm/parsing/selection/exit-intent";
import { CHANGE_DISTRITO_PATTERNS } from "@/lib/constants/regex/selection";

export function detectChangeDistritoIntent(text: string): boolean {
  const phrase = normalizeIntentPhrase(text);
  if (!phrase) return false;
  return CHANGE_DISTRITO_PATTERNS.some((pattern) => pattern.test(phrase));
}
