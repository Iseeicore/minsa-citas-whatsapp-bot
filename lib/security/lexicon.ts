// Data for lib/security/lexical-guard.ts. Kept separate so the business owner
// can review/extend the vocabulary without touching the algorithm.
//
// Every pattern here is matched against a WHOLE normalized token (lowercase,
// no accents) or against the space-joined token stream — never as a raw
// substring — so short roots cannot fire inside unrelated words
// ("computadora" must not contain "puta", "Isaac S. Mendoza" must not
// contain "csm").

// ---- Insults --------------------------------------------------------------

export const INSULT_TOKEN_PATTERNS: RegExp[] = [
  /^idiot(?:a|as|ez|eces|azo|azos|aza|azas)$/,
  /^imbecil(?:es|idad|azo|azos|aza|azas)?$/,
  /^estupid(?:o|a|os|as|ez|eces|azo|azos|aza|azas)$/,
  /^tarad(?:o|a|os|as|azo|azos)$/,
  /^cojud(?:o|a|os|as|ez|eces|azo|azos)$/,
  /^huev(?:on|ona|ones|onas|onazo|onazos|ada|adas)$/, // NOT huevo/huevos (eggs)
  /^mierd(?:a|as|oso|osa|osos|osas)$/,
  /^pendej(?:o|a|os|as|ada|adas|azo|azos|aza|azas)$/,
  /^malparid(?:o|a|os|as)$/,
  /^maldit(?:o|a|os|as)$/,
  /^maricon(?:es|azo|azos)?$/,
  /^cabron(?:es|a|as|azo|azos)?$/,
  /^put(?:o|a|os|as)$/,
  /^putamadre$/,
  /^hijueputa$/,
  /^hijoputa$/,
  /^concha(?:tu|su)madre$/,
  /^conche?tumare$/,
  /^conchatumare$/,
  /^estafador(?:es|a|as)?$/,
  /^ladron(?:es|a|as)?$/,
  /^incompetentes?$/,
  // Abbreviations
  /^hdp(?:s|ta)?$/,
  /^ctm(?:re|r)?$/,
  /^csm(?:re|r)?$/,
  /^ptm(?:re|r)?$/,
  /^lptm(?:re)?$/,
  /^mrd$/,
  /^mrda$/,
];

// Multi-word insults, matched on the space-joined normalized tokens.
export const INSULT_PHRASE_PATTERNS: RegExp[] = [
  /\bhijos? de (?:la )?(?:gran )?put[ao]s?\b/,
  /\bconcha (?:de )?(?:tu|su) madre\b/,
  /\bputa madre\b/,
  /\bla puta que (?:te|lo|la) pario\b/,
];

// Fuzzy matching (bounded Levenshtein) runs against this short list only.
export const FUZZY_TARGETS: string[] = [
  "idiota",
  "imbecil",
  "estupido",
  "tarado",
  "cojudo",
  "huevon",
  "mierda",
  "pendejo",
  "malparido",
];

// Ordinary words that land within edit distance of a FUZZY_TARGET (or are
// otherwise risky) — they are never fuzzy-matched.
export const PROTECTED_WORDS = new Set([
  "tarde",
  "tardes",
  "tarda",
  "tardo",
  "tardan",
  "tardar",
  "tardara",
  "idioma",
  "idiomas",
  "estudio",
  "estudios",
  "estudiar",
  "estupendo",
  "estupenda",
  "hueco",
  "huecos",
  "huevo",
  "huevos",
  "merida",
  "pendiente",
  "pendientes",
]);

// Fixed name/phrase exceptions removed from the token stream before matching.
export const PROTECTED_PHRASES = ["ladron de guevara"];

// ---- Context (who is the citizen talking about?) ---------------------------

// Wants an appointment.
export const CITA_TOKEN_PATTERNS: RegExp[] = [
  /^citas?$/,
  /^agend\w*$/,
  /^turnos?$/,
  /^consultas?$/,
  /^reserv\w*$/,
  /^program(?:ar|arme|ame|enme)$/,
];

// Complains about a service.
export const COMPLAINT_TOKEN_PATTERNS: RegExp[] = [
  /^reclam\w*$/,
  /^quej\w*$/,
  /^pesim\w*$/,
  /^denunci\w*$/,
  /^maltrat\w*$/,
  /^abus\w*$/,
  /^demor\w*$/,
];

export const COMPLAINT_PHRASE_PATTERNS: RegExp[] = [
  /\bmal(?:a)? (?:servicio|atencion|trato)\b/,
  /\bno (?:me )?(?:atienden|atiende|atendieron|atendio|atendian|hacen caso|hicieron caso)\b/,
  /\bnadie (?:me )?atiende\b/,
];

// Health/service vocabulary: an insult next to one of these is, at worst, an
// angry complaint about the service — never blocked outright.
export const HEALTH_TOKEN_PATTERNS: RegExp[] = [
  /^doctor\w*$/,
  /^medic\w*$/,
  /^hospital\w*$/,
  /^postas?$/,
  /^enferm\w*$/,
  /^clinica\w*$/,
  /^emergenc\w*$/,
  /^urgenc\w*$/,
  /^dolor\w*$/,
  /^atencion$/,
  /^essalud$/,
  /^minsa$/,
  /^salud$/,
  /^sis$/,
];
