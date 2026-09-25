export const INSULT_TOKEN_PATTERNS: RegExp[] = [
  /^idiot(?:a|as|ez|eces|azo|azos|aza|azas)$/,
  /^imbecil(?:es|idad|azo|azos|aza|azas)?$/,
  /^estupid(?:o|a|os|as|ez|eces|azo|azos|aza|azas)$/,
  /^tarad(?:o|a|os|as|azo|azos)$/,
  /^cojud(?:o|a|os|as|ez|eces|azo|azos)$/,
  /^huev(?:on|ona|ones|onas|onazo|onazos|ada|adas)$/,
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
  /^hdp(?:s|ta)?$/,
  /^ctm(?:re|r)?$/,
  /^csm(?:re|r)?$/,
  /^ptm(?:re|r)?$/,
  /^lptm(?:re)?$/,
  /^mrd$/,
  /^mrda$/,
];

export const INSULT_PHRASE_PATTERNS: RegExp[] = [
  /\bhijos? de (?:la )?(?:gran )?put[ao]s?\b/,
  /\bconcha (?:de )?(?:tu|su) madre\b/,
  /\bputa madre\b/,
  /\bla puta que (?:te|lo|la) pario\b/,
];

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

export const PROTECTED_PHRASES = ["ladron de guevara"];

export const CITA_TOKEN_PATTERNS: RegExp[] = [
  /^citas?$/,
  /^agend\w*$/,
  /^turnos?$/,
  /^consultas?$/,
  /^reserv\w*$/,
  /^program(?:ar|arme|ame|enme)$/,
];

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
