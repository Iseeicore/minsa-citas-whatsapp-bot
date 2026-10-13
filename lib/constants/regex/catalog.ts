export const ESTABLECIMIENTO_ABBREVIATIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bCentro Materno Infantil\b/i, "C.M.I."],
  [/\bCentro de Salud\b/i, "C.S."],
  [/\bPuesto de Salud\b/i, "P.S."],
  [/\bHospital\b/i, "Hosp."],
];

export const DOTTED_ABBREVIATION = /(?<!\p{L})(?:\p{L}\.){2,}/gu;
export const TITLE_CASED_ROMAN_NUMERAL = /(?<!\p{L})(?:Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii)(?!\p{L})/gu;
export const CONSONANT_ONLY_ACRONYM = /(?<!\p{L})[b-df-hj-np-tv-z]{2,3}(?!\p{L})/giu;
export const CONSULTA_EXTERNA_PREFIX = /^CONSULTA\s+EXTERNA\s*-\s*/i;
export const EDGE_SPACES_AND_HYPHENS = /^[\s-]+|[\s-]+$/g;
export const NAME_SEGMENT_SEPARATOR = /\s*\/\s*|-/;

export const MEDICINA_GENERAL_PHRASE = /\bMEDIC(?:INA|O) GENERAL\b/;

export const ESPECIALIDAD_ROOTS: Array<[RegExp, string]> = [
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

export const PLAUSIBLE_PLACE_NAME = /^[\p{L}][\p{L}\s.'-]{2,59}$/u;

export const SUBSTANTIAL_WORD = /\p{L}{5,}/u;

export const ESTABLECIMIENTO_SYNONYMS: Array<[RegExp, string]> = [
  [/\bpostas?\b/g, "puesto de salud"],
  [/\bp\.?\s?s\.?(?=\s|$)/g, "puesto de salud"],
  [/\bc\.?\s?s\.?(?=\s|$)/g, "centro de salud"],
  [/\bcentros de salud\b/g, "centro de salud"],
];
