import { PROTECTED_PHRASES } from "@/lib/security/lexicon";

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
  /^corrup\w*$/,
  /^coima\w*$/,
  /^soborn\w*$/,
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

export const HAS_LETTER = /[a-z]/;
export const HAS_LEET_CHAR = /[01345789@$!]/;
export const NON_TOKEN_CHARS = /[^a-z0-9@$!]+/;
export const EDGE_EXCLAMATION_MARKS = /^!+|!+$/g;
export const EVERY_LEET_CHAR = /[01345789@$!]/g;
export const SYMBOL_LEFT_IN_TOKEN = /[^a-z0-9]/g;
export const DOUBLED_CONSONANT = /([b-df-hj-np-tv-z])\1+/g;
export const SEPARATED_WORD = /^[\p{L}\p{N}@$!]+(?:[.\-_*·][\p{L}\p{N}@$!]+)+[.\-_*·]*$/u;
export const PROTECTED_PHRASE_PATTERNS: readonly RegExp[] = PROTECTED_PHRASES.map((phrase) => new RegExp(`\\b${phrase}\\b`, "g"));
export const CANONICAL_INITIALS = /(?<![\p{L}\p{N}])(?:\p{Lu}\.\s+){2,}\p{Lu}\.?(?![\p{L}\p{N}])/gu;

export const LINK_MARKERS = /(?:https?:\/\/|\bwww\.|\bwa\.me\b|\bt\.me\b|\bbit\.ly\b|\btinyurl\.com\b)/i;
export const BARE_DOMAIN = /\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|info|xyz|io|me|co|pe|gob\.pe|edu\.pe)\b/i;
export const REPEATED_CHARACTER = /(\S)\1{9,}/u;
export const PICTOGRAPH = /\p{Extended_Pictographic}/gu;
export const NOT_EMOJI_NOR_SPACE = /[^\p{Extended_Pictographic}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\s]/u;

export const LETTER = /\p{L}/gu;
