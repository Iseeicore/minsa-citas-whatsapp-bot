import distritos from "@/data/peru-distritos.json";
import { normalizeText } from "@/lib/fsm/parsing/text";
import type { DistritoAiCandidate } from "@/lib/fsm/parsing/ai/distrito";

/** Datos de jmcastagnetto/ubigeo-peru-aumentado (MIT), incluidos en el repo para no depender de una consulta en tiempo de ejecución. */
const DISTRITOS = distritos as DistritoAiCandidate[];

const BY_DISTRITO_NAME = new Map<string, DistritoAiCandidate[]>();
for (const row of DISTRITOS) {
  const key = normalizeText(row.distrito);
  const existing = BY_DISTRITO_NAME.get(key);
  if (existing) {
    existing.push(row);
  } else {
    BY_DISTRITO_NAME.set(key, [row]);
  }
}

export function searchDistrito(text: string): DistritoAiCandidate[] {
  const key = normalizeText(text);
  if (!key) return [];
  return BY_DISTRITO_NAME.get(key) ?? [];
}

export function searchDistritoByPrefix(text: string): DistritoAiCandidate[] {
  const key = normalizeText(text);
  if (!key) return [];
  return DISTRITOS.filter((row) => normalizeText(row.distrito).startsWith(key));
}
