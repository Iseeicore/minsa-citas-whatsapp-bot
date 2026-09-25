import { normalizeText, toDisplayPlace } from "@/lib/fsm/parsing/text";
import { searchDistrito } from "@/lib/fsm/flows/cita/ubigeo-data";

const ESPECIALIDAD_ROOTS: Array<[RegExp, string]> = [
  [/^odontolog/, "Odontología"],
  [/^pediatr/, "Pediatría"],
  [/^ginecolog/, "Ginecología"],
  [/^cardiolog/, "Cardiología"],
  [/^dermatolog/, "Dermatología"],
  [/^oftalmolog/, "Oftalmología"],
  [/^traumatolog/, "Traumatología"],
  [/^psicolog/, "Psicología"],
  [/^nutricion/, "Nutrición"],
];

const PLACE_PREPOSITIONS = new Set(["EN", "POR", "DE", "DEL", "CERCA", "DESDE", "PARA"]);
const MAX_PLACE_WORDS = 4;
const PILOT_DEPARTAMENTO = "LIMA";

export type CitaHints = { especialidad?: string; distrito?: string };

export function extractCitaHints(message: string): CitaHints {
  const words = normalizeText(message)
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);

  const hints: CitaHints = {};

  if (/\bMEDIC(?:INA|O) GENERAL\b/.test(words.join(" "))) hints.especialidad = "Medicina General";

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
      const inPilotArea = searchDistrito(phrase).some(
        (candidate) => normalizeText(candidate.departamento) === PILOT_DEPARTAMENTO,
      );
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
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);
  return words.some((word) => STRONG_PLACE_PREPOSITIONS.has(word));
}
