export const CODIGO_EN_TEXTO = /(?<![A-Z0-9-])MINSA-\d{4}-(?:A-)?\d{6,}(?![A-Z0-9-])/i;
export const CODIGO_EXACTO = /^MINSA-\d{4}-(?:A-)?\d{6,}$/i;
export const CODIGO_ANONIMO = /^MINSA-\d{4}-A-\d{6,}$/i;
export const CONSULTA_KEYWORD =
  /\b(?:consultar|consulta|revisar|ver|saber|estado|seguimiento)\b.{0,30}\b(?:incidencia|reporte|denuncias?)\b/i;
export const REGISTRO_KEYWORD = /\b(?:registrar|presentar|reportar|ingresar|denunciar|hacer|poner|formular|interponer)\b/i;

export const CODIGO_IPRESS_LABEL = /codigo[-\s]?ipress\s*:?\s*/i;
export const INCIDENCIA_WORD = /\bincidencia\b/i;
export const INICIO_SENTENCE =
  /^\s*(?:hola\b[\s,!.]*)?(?:buen[oa]s\s+\p{L}+[\s,!.]*)?quiero\s+(?:presentar|reportar|registrar)\s+una\s+(?:incidencia|denuncia(?:\s+anticorrupci[oó]n)?)\b/iu;
export const LEADING_NUMERIC_TOKEN = /^(\d+)(?![\p{L}\d_])/u;
export const LEADING_PREPOSITIONS = /^(?:(?:en|de|del|el|la|los|las|sobre|por)\s+)+/i;
export const LEADING_ZEROS = /^0+/;
export const POSITIVE_INTEGER = /^[1-9]\d*$/;
export const LEADING_SPACES_AND_PUNCTUATION = /^[\s.,;:!?-]+/;
export const TRAILING_SPACES_AND_HYPHENS = /[\s-]+$/;
export const LEADING_TOKEN = /^\S+/;
export const BARE_CODIGO = /^\s*(?:codigo[-\s]?ipress\s*:?\s*)?(\d{1,9})\s*[.!]?\s*$/i;

export const CODIGO_VALIDO = /^MINSA-\d{4}-(?:A-)?\d{6,}$/;

export const IMAGE_DATA_URI = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i;

export const CONSENT_ACCEPTED_PHRASE = /^(?:si |yo )?autorizo(?: y deseo continuar)?$/;
export const CONSENT_DECLINED_PHRASE = /^no autorizo$/;
