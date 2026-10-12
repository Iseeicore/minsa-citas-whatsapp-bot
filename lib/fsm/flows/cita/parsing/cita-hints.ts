import { normalizeText, toDisplayPlace } from "@/lib/fsm/parsing/text/text";
import { searchDistrito } from "@/lib/fsm/flows/cita/data/ubigeo-data";
import { isAllowedDepartamento } from "@/lib/fsm/flows/cita/pilot-scope";
import { SYMBOLS_IN_UPPERCASE_TEXT } from "@/lib/constants/regex/text";
import { ESPECIALIDAD_ROOTS, MEDICINA_GENERAL_PHRASE } from "@/lib/constants/regex/catalog";
import { MEDICINA_GENERAL_ESPECIALIDAD_TEXT } from "@/lib/constants/textos/cita-catalogo";
import { MAX_PLACE_WORDS } from "@/lib/constants/limits/cita";

const PLACE_PREPOSITIONS = new Set(["EN", "POR", "DE", "DEL", "CERCA", "DESDE", "PARA"]);

export type CitaHints = { especialidad?: string; distrito?: string };

export function extractCitaHints(message: string): CitaHints {
  const words = normalizeText(message)
    .replace(SYMBOLS_IN_UPPERCASE_TEXT, " ")
    .split(" ")
    .filter(Boolean);

  const hints: CitaHints = {};

  if (MEDICINA_GENERAL_PHRASE.test(words.join(" "))) hints.especialidad = MEDICINA_GENERAL_ESPECIALIDAD_TEXT;

  for (const word of hints.especialidad ? [] : words) {
    const lower = word.toLowerCase();
    const found = ESPECIALIDAD_ROOTS.find(([root]) => root.test(lower));
    if (found) {
      hints.especialidad = found[1];
      break;
    }
  }

  for (let start = 1; start < words.length && !hints.distrito; start++) {
    if (!PLACE_PREPOSITIONS.has(words[start - 1])) continue;

    for (let length = Math.min(MAX_PLACE_WORDS, words.length - start); length >= 1; length--) {
      const phrase = words.slice(start, start + length).join(" ");
      const inPilotArea = searchDistrito(phrase).some((candidate) => isAllowedDepartamento(candidate.departamento));
      if (inPilotArea) {
        hints.distrito = toDisplayPlace(phrase);
        break;
      }
    }
  }

  return hints;
}

const STRONG_PLACE_PREPOSITIONS = new Set(["EN", "CERCA", "DESDE"]);

export function mentionsPlacePreposition(message: string): boolean {
  const words = normalizeText(message)
    .replace(SYMBOLS_IN_UPPERCASE_TEXT, " ")
    .split(" ")
    .filter(Boolean);
  return words.some((word) => STRONG_PLACE_PREPOSITIONS.has(word));
}
