export const DAY_MONTH_YEAR_ID = /^(\d{2})\/(\d{2})\/(\d{4})$/;
export const YEAR_MONTH_DAY_ID = /^(\d{4})(\d{2})(\d{2})$/;
export const SYMBOLS_OUTSIDE_DATE_TEXT = /[^a-z0-9/ -]+/g;

export const EARLIEST_DATE_REQUEST =
  /\b(?:lo|la) mas (?:pronto|antes|cercan[oa])\b|\bcualquiera\b|\bcuanto antes\b|\bprimera (?:disponible|fecha)\b/;

export const DAY_MONTH_AND_OPTIONAL_YEAR = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/;
export const DAY_AFTER_TOMORROW = /\bpasado manana\b/;
export const TOMORROW = /\bmanana\b/;
export const TODAY = /\bhoy\b/;
export const DAY_OF_MONTH = /\b(?:dia|el)\s+(\d{1,2})\b/;

export const DOTTED_MERIDIEM = /\b([ap])\.\s?m\.?/g;
export const SYMBOLS_OUTSIDE_TIME_TEXT = /[^a-z0-9: ]+/g;
export const MORNING_WORD = /\b(?:am|manana|madrugada)\b/;
export const AFTERNOON_OR_NIGHT_WORD = /\b(?:pm|tarde|noche)\b/;
export const EARLIEST_TIME_REQUEST = /\blo mas (?:pronto|temprano)\b|\bcuanto antes\b|\bla mas temprano\b/;
export const LATEST_TIME_REQUEST = /\b(?:lo|la) mas tarde\b/;
export const NOON = /\bmediodia\b/;
export const MIDNIGHT = /\bmedianoche\b/;
export const HOUR_COLON_MINUTE = /\b(\d{1,2}):(\d{2})\b/;
export const HOUR_MINUS_MINUTES = /\b(\d{1,2}) menos (cuarto|\d{1,2})\b/;
export const HOUR_PLUS_MINUTES = /\b(\d{1,2}) (?:y|con) (media|cuarto|\d{1,2})\b/;
export const HOUR_ON_THE_DOT = /\b(\d{1,2}) en punto\b/;
export const COMPACT_HOUR_AND_MINUTE = /\b(\d{3,4})\b/;
export const BARE_HOUR = /\b(\d{1,2})\b/;
export const HOUR_MARKER = /\ba las?\b|\blas \d|\bhoras?\b|\bhrs?\b/;

export const TEMPORAL_PHRASE =
  /\b(semana|mes|proxim[oa]s?|siguiente|dias?|fin|final|inicio|principios?|quincena|luego|despues|pronto|temprano|urgente|antes|cuando|fecha)\b/;

export const SLOT_STARTING_WITH_CLOCK_TIME = /^\d{2}:\d{2}\|/;

export const ISO_DATE_HYPHENS = /-/g;
