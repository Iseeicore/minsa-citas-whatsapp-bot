import distritos from "@/data/peru-distritos.json";
import { normalizeText } from "@/lib/fsm/parsing/domain";
import type { DistritoAiCandidate } from "@/lib/fsm/parsing/ai";

// Vendored from jmcastagnetto/ubigeo-peru-aumentado (MIT), trimmed to just
// the three fields we need. Peru's district-level political division
// barely ever changes, so this stays accurate without needing to be
// re-fetched at runtime — no dependency on an external repo being up for
// the bot to resolve a district.
const DISTRITOS = distritos as DistritoAiCandidate[];

// Keyed by normalized distrito name -> every official (departamento,
// provincia, distrito) row with that name, since the same district name can
// be official in more than one region (e.g. "Miraflores" appears 4 times:
// Arequipa, Huánuco, Lima, and Yauyos).
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

// Exact match only (after normalization) — deliberately no fuzzy/typo
// tolerance here. A name this doesn't recognize falls through to the AI
// (lib/fsm/parsing/ai.ts's resolveDistritoAi) as a contingency layer, and from
// there to the manual departamento/provincia/distrito flow. This function
// is the fast, free, deterministic first attempt, not the only attempt.
export function searchDistrito(text: string): DistritoAiCandidate[] {
  const key = normalizeText(text);
  if (!key) return [];
  return BY_DISTRITO_NAME.get(key) ?? [];
}

// Prefix match (like SQL's `LIKE 'text%'`) — for a partial name such as "San
// Juan" that isn't itself an official district name anywhere (it happens to
// be an EXACT match in four other regions, none in Lima, which is what
// searchDistrito alone would find), but IS the start of real district names
// like "San Juan de Lurigancho". Caller decides what to do with an overly
// broad prefix (handlers-cita.ts's WhatsApp row-count cap already handles
// that) — this just returns every match, nationwide, same as searchDistrito.
export function searchDistritoByPrefix(text: string): DistritoAiCandidate[] {
  const key = normalizeText(text);
  if (!key) return [];
  return DISTRITOS.filter((row) => normalizeText(row.distrito).startsWith(key));
}
