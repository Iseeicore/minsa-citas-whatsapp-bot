import { ALL_WHITESPACE_RUNS, COMBINING_ACCENT_MARKS } from "@/lib/fsm/parsing/text/text-patterns";

const MAX_CONSULTA_LENGTH = 120;

const SYNONYMS: Array<[RegExp, string]> = [
  [/\bpostas?\b/g, "puesto de salud"],
  [/\bp\.?\s?s\.?(?=\s|$)/g, "puesto de salud"],
  [/\bc\.?\s?s\.?(?=\s|$)/g, "centro de salud"],
  [/\bcentros de salud\b/g, "centro de salud"],
];

function fold(text: string): string {
  return text.normalize("NFD").replace(COMBINING_ACCENT_MARKS, "");
}

function limpiar(text: string): string {
  return fold(text).toLowerCase().replace(ALL_WHITESPACE_RUNS, " ").trim().slice(0, MAX_CONSULTA_LENGTH);
}

export function normalizarConsulta(text: string): string {
  let query = limpiar(text);
  for (const [pattern, replacement] of SYNONYMS) query = query.replace(pattern, replacement);
  return query.replace(ALL_WHITESPACE_RUNS, " ").trim();
}

export function variantesConsulta(text: string): [string, string] {
  return [limpiar(text), normalizarConsulta(text)];
}
