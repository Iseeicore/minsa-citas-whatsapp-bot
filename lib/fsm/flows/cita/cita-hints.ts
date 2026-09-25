import { normalizeText, toDisplayPlace } from "@/lib/fsm/parsing/text";
import { searchDistrito } from "@/lib/fsm/flows/cita/ubigeo-data";

// Deterministic (no AI) reading of what a citizen already said about the cita
// they want, so it isn't thrown away when the message also carried an insult
// (see routeLexicalAction). The result feeds the same hint slots the AI intent
// step fills for a polite message.

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

  // Two-word specialty: no single word identifies it.
  if (/\bMEDIC(?:INA|O) GENERAL\b/.test(words.join(" "))) hints.especialidad = "Medicina General";

  for (const word of hints.especialidad ? [] : words) {
    const lower = word.toLowerCase();
    const found = ESPECIALIDAD_ROOTS.find(([root]) => root.test(lower));
    if (found) {
      hints.especialidad = found[1];
      break;
    }
  }

  // A district is only trusted right after a place preposition ("en San
  // Borja") and only when it is an official district of the pilot department,
  // so unrelated words and non-Lima places never become a hint.
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

// A stricter subset of PLACE_PREPOSITIONS for mentionsPlacePreposition below:
// "de"/"del"/"para"/"por" are common for reasons that have nothing to do
// with a place ("cita de odontología", "para mañana"), so using the full
// set there would fire on almost every message. These three are locative
// often enough to be worth an AI call when nothing else matched.
const STRONG_PLACE_PREPOSITIONS = new Set(["EN", "CERCA", "DESDE"]);

// A cheap, deterministic signal that the message probably named a place,
// even when extractCitaHints couldn't resolve it locally (a typo like "sam
// borja" defeats the exact-match search above, but the preposition is still
// there). Callers use this to decide whether an AI resolution attempt over
// the raw message is worth its cost, instead of firing on every message
// that never mentioned a place at all (e.g. a bare "quiero una cita").
export function mentionsPlacePreposition(message: string): boolean {
  const words = normalizeText(message)
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);
  return words.some((word) => STRONG_PLACE_PREPOSITIONS.has(word));
}
