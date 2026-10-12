import { ALL_WHITESPACE_RUNS, COMBINING_ACCENT_MARKS, SENTENCE_PUNCTUATION } from "@/lib/constants/regex/text";
const OMIT_PHRASES = new Set([
  "omitir",
  "omito",
  "no se",
  "no lo se",
  "no se el nombre",
  "no recuerdo",
  "no me acuerdo",
  "no quiero",
  "no quiero decirlo",
  "prefiero no",
  "prefiero no decirlo",
  "ninguno",
  "ninguna",
  "ninguno de estos",
  "sin establecimiento",
  "no tengo",
]);

function fold(text: string): string {
  return text.normalize("NFD").replace(COMBINING_ACCENT_MARKS, "");
}

export function quiereOmitirUbicacion(text: string): boolean {
  const normalized = fold(text).toLowerCase().replace(SENTENCE_PUNCTUATION, " ").replace(ALL_WHITESPACE_RUNS, " ").trim();
  return OMIT_PHRASES.has(normalized);
}
