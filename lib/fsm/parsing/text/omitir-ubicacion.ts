import { ALL_WHITESPACE_RUNS, COMBINING_ACCENT_MARKS, SENTENCE_PUNCTUATION } from "@/lib/constants/regex/text";
import { OMITIR_UBICACION_PHRASES } from "@/lib/constants/palabras-clave";

function fold(text: string): string {
  return text.normalize("NFD").replace(COMBINING_ACCENT_MARKS, "");
}

export function quiereOmitirUbicacion(text: string): boolean {
  const normalized = fold(text).toLowerCase().replace(SENTENCE_PUNCTUATION, " ").replace(ALL_WHITESPACE_RUNS, " ").trim();
  return OMITIR_UBICACION_PHRASES.has(normalized);
}
