import { normalizeText, toDisplayPlace } from "./domain";
import { searchDistrito } from "./ubigeo-data";

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
  // Field-tested gap: "necesito cita en medicina interna" fell through to
  // the generic menu because none of these existed yet — only single words
  // were covered, and "medicina" alone is ambiguous with "MEDICINA GENERAL"
  // (handled separately above as a two-word special case), so it's excluded
  // here on purpose. This list is only a free-text hint (see
  // matchEspecialidadHint in handlers-cita.ts) — it never decides what's
  // actually offered, that always comes from MINSA's real especialidad list.
  [/^urolog/, "Urología"],
  [/^otorrinolaringolog/, "Otorrinolaringología"],
  [/^neurolog/, "Neurología"],
  [/^psiquiatr/, "Psiquiatría"],
  [/^endocrinolog/, "Endocrinología"],
  [/^reumatolog/, "Reumatología"],
  [/^obstetric/, "Obstetricia"],
];

// Two-word specialties, same reason "MEDICINA GENERAL" already needed one:
// no single word identifies them (and for "medicina interna"/"cirugía
// general", the first word alone is ambiguous with other specialties).
const ESPECIALIDAD_PHRASES: Array<[RegExp, string]> = [
  [/\bMEDIC(?:INA|O) INTERNA\b/, "Medicina Interna"],
  [/\bMEDIC(?:INA|O) FAMILIAR\b/, "Medicina Familiar"],
  [/\bCIRUGIA GENERAL\b/, "Cirugía General"],
];

const PLACE_PREPOSITIONS = new Set(["EN", "POR", "DE", "DEL", "CERCA", "DESDE", "PARA"]);const MAX_PLACE_WORDS = 4;
const PILOT_DEPARTAMENTO = "LIMA";

export type CitaHints = { especialidad?: string; distrito?: string };

export function extractCitaHints(message: string): CitaHints {
  const words = normalizeText(message)
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);

  const hints: CitaHints = {};

  // Two-word specialty: no single word identifies it.
  const joined = words.join(" ");
  if (/\bMEDIC(?:INA|O) GENERAL\b/.test(joined)) hints.especialidad = "Medicina General";
  if (!hints.especialidad) {
    const phrase = ESPECIALIDAD_PHRASES.find(([root]) => root.test(joined));
    if (phrase) hints.especialidad = phrase[1];
  }

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
