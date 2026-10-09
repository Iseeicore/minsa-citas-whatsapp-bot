export type InicioIncidencia = {
  origen: "qr" | "texto";
  codigoRenipress?: string;
  nombre?: string;
  resto?: string;
};

const MAX_CODIGO_LENGTH = 8;
const MAX_NOMBRE_LENGTH = 100;
const MAX_NOMBRE_WORDS = 14;

const LABEL = /codigo[-\s]?ipress\s*:?\s*/i;
const INCIDENCIA_WORD = /\bincidencia\b/i;
const INICIO_SENTENCE = /^\s*(?:hola\b[\s,!.]*)?(?:buen[oa]s\s+\p{L}+[\s,!.]*)?quiero\s+(?:presentar|reportar|registrar)\s+una\s+incidencia\b/iu;
const NUMERIC_TOKEN = /^(\d+)(?![\p{L}\d_])/u;
const LEADING_PREPOSITIONS = /^(?:(?:en|de|del|el|la|los|las|sobre|por)\s+)+/i;

function fold(text: string): string {
  return Array.from(text, (char) => (char.length === 1 ? char.normalize("NFD")[0] : char)).join("");
}

function normalizeCodigo(raw: string): string | undefined {
  const withoutZeros = raw.replace(/^0+/, "");
  if (!/^[1-9]\d*$/.test(withoutZeros) || withoutZeros.length > MAX_CODIGO_LENGTH) return undefined;
  return withoutZeros;
}

function tidy(value: string): string | undefined {
  const cleaned = value.replace(/^[\s.,;:!?-]+/, "").replace(/[\s-]+$/, "").trim();
  return cleaned || undefined;
}

function plausibleNombre(value: string | undefined): string | undefined {
  if (!value || value.length > MAX_NOMBRE_LENGTH || value.split(/\s+/).length > MAX_NOMBRE_WORDS) return undefined;
  return value;
}

function fromQr(text: string, labelIndex: number, labelLength: number): InicioIncidencia | null {
  const before = text.slice(0, labelIndex);
  const word = INCIDENCIA_WORD.exec(fold(before));
  if (!word) return null;

  const after = text.slice(labelIndex + labelLength);
  const numeric = NUMERIC_TOKEN.exec(after);
  const token = numeric ? numeric[1] : (/^\S+/.exec(after)?.[0] ?? "");
  if (!token) return null;

  const result: InicioIncidencia = { origen: "qr" };
  const codigoRenipress = numeric ? normalizeCodigo(numeric[1]) : undefined;
  if (codigoRenipress) result.codigoRenipress = codigoRenipress;
  const nombre = plausibleNombre(tidy(before.slice(word.index + word[0].length)));
  if (nombre) result.nombre = nombre;
  const resto = tidy(after.slice(token.length));
  if (resto) result.resto = resto;
  return result;
}

function fromSentence(text: string, sentenceLength: number): InicioIncidencia {
  const result: InicioIncidencia = { origen: "texto" };
  const written = tidy(text.slice(sentenceLength));
  const nombre = plausibleNombre(tidy(written?.replace(LEADING_PREPOSITIONS, "") ?? ""));
  if (nombre) result.nombre = nombre;
  if (written) result.resto = written;
  return result;
}

/**
 * Reconoce cómo empieza una incidencia. Con la etiqueta CODIGO-IPRESS (mensaje que precarga el QR) lee el código y el nombre;
 * sin ella, si el texto abre con «quiero presentar una incidencia», toma lo que sigue como nombre candidato, que quien lo use
 * debe buscar en el padrón y confirmar. Lo que se agregue después del código queda en resto. Si no es ninguno, devuelve null.
 */
export function parseInicioIncidencia(text: string): InicioIncidencia | null {
  const folded = fold(text);
  const label = LABEL.exec(folded);
  const qr = label ? fromQr(text, label.index, label[0].length) : null;
  if (qr) return qr;

  const sentence = INICIO_SENTENCE.exec(folded);
  if (sentence) return fromSentence(text, sentence[0].length);
  return null;
}

const BARE_CODIGO = /^\s*(?:codigo[-\s]?ipress\s*:?\s*)?(\d{1,9})\s*[.!]?\s*$/i;

/** Reconoce un código IPRESS escrito solo («6206» o «CODIGO-IPRESS 6206») y lo devuelve sin ceros; si no lo es, undefined. */
export function parseCodigoSuelto(text: string): string | undefined {
  const match = BARE_CODIGO.exec(fold(text));
  return match ? normalizeCodigo(match[1]) : undefined;
}

/**
 * Lo que de verdad escribió la persona. Del mensaje del QR solo cuenta lo que agregó después del código: el nombre del
 * establecimiento viene precargado y no debe pasar por los filtros de insultos ni de emergencia (hay centros que se llaman «C.S.M.»).
 */
export function textoDeLaPersona(text: string): string {
  const inicio = parseInicioIncidencia(text);
  return inicio?.origen === "qr" ? (inicio.resto ?? "") : text;
}
