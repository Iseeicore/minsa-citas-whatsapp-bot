import { ALL_WHITESPACE_RUNS } from "@/lib/constants/regex/text";
import { ESTABLECIMIENTO_SYNONYMS } from "@/lib/constants/regex/catalog";
import { stripAccents } from "@/lib/utils/text-values";

const MAX_CONSULTA_LENGTH = 120;

function limpiar(text: string): string {
  return stripAccents(text).toLowerCase().replace(ALL_WHITESPACE_RUNS, " ").trim().slice(0, MAX_CONSULTA_LENGTH);
}

export function normalizarConsulta(text: string): string {
  let query = limpiar(text);
  for (const [pattern, replacement] of ESTABLECIMIENTO_SYNONYMS) query = query.replace(pattern, replacement);
  return query.replace(ALL_WHITESPACE_RUNS, " ").trim();
}

export function variantesConsulta(text: string): [string, string] {
  return [limpiar(text), normalizarConsulta(text)];
}
