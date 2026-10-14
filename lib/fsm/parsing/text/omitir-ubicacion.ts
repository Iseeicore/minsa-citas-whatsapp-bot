import { ALL_WHITESPACE_RUNS, SENTENCE_PUNCTUATION } from "@/lib/constants/regex/text";
import { OMITIR_UBICACION_PHRASES } from "@/lib/constants/palabras-clave";
import { stripAccents } from "@/lib/utils/text-values";

export function quiereOmitirUbicacion(text: string): boolean {
  const normalized = stripAccents(text).toLowerCase().replace(SENTENCE_PUNCTUATION, " ").replace(ALL_WHITESPACE_RUNS, " ").trim();
  return OMITIR_UBICACION_PHRASES.has(normalized);
}
