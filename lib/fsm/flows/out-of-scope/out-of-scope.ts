import { ALL_WHITESPACE_RUNS, SYMBOLS_IN_UPPERCASE_TEXT } from "@/lib/constants/regex/text";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import type { OosCategory } from "@/lib/fsm/flows/out-of-scope/out-of-scope-messages";
import { OosCategory as OosCategoryEnum } from "@/lib/enums/oos-category";
import { OUT_OF_SCOPE_RULES } from "@/lib/constants/regex/out-of-scope";

export { OOS_MESSAGES, type OosCategory } from "@/lib/fsm/flows/out-of-scope/out-of-scope-messages";

const toPlainWords = (text: string): string =>
  normalizeText(text)
    .replace(SYMBOLS_IN_UPPERCASE_TEXT, " ")
    .replace(ALL_WHITESPACE_RUNS, " ")
    .trim();

export function detectOutOfScope(text: string): OosCategory | undefined {
  const plain = toPlainWords(text);
  if (!plain) return undefined;

  for (const [category, patterns] of OUT_OF_SCOPE_RULES) {
    if (patterns.some((pattern) => pattern.test(plain))) return category;
  }
  return undefined;
}

export const isEmergency = (text: string): boolean => detectOutOfScope(text) === OosCategoryEnum.OOS_01;

export const IN_FLOW_MAX_CHARS = 120;
export const isEmergencyInFlow = (text: string): boolean => text.length <= IN_FLOW_MAX_CHARS && isEmergency(text);

const single = (text: string): string | undefined => {
  const words = toPlainWords(text).split(" ");
  return words.length === 1 ? words[0] : undefined;
};

export const isCitaKeyword = (text: string): boolean => {
  const word = single(text);
  return word === "CITA" || word === "CITAS";
};

export const isContinueKeyword = (text: string): boolean => single(text) === "CONTINUAR";
