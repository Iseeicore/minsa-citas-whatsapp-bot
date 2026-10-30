import { WHITESPACE_RUN } from "@/lib/constants/regex/text";
import {
  BARE_CODIGO,
  CODIGO_IPRESS_LABEL,
  INCIDENCIA_WORD,
  INICIO_SENTENCE,
  LEADING_NUMERIC_TOKEN,
  LEADING_PREPOSITIONS,
  LEADING_SPACES_AND_PUNCTUATION,
  LEADING_TOKEN,
  LEADING_ZEROS,
  POSITIVE_INTEGER,
  TRAILING_SPACES_AND_HYPHENS,
} from "@/lib/constants/regex/incidencia";
import { IncidenciaOrigen } from "@/lib/enums/incidencia-origen";
import {
  MAX_CODIGO_RENIPRESS_LENGTH,
  MAX_NOMBRE_ESTABLECIMIENTO_LENGTH,
  MAX_NOMBRE_ESTABLECIMIENTO_WORDS,
} from "@/lib/constants/limits/incidencia";

export type InicioIncidencia = {
  origen: IncidenciaOrigen.QR | IncidenciaOrigen.TEXTO | IncidenciaOrigen.IA;
  codigoRenipress?: string;
  nombre?: string;
  resto?: string;
};

function fold(text: string): string {
  return Array.from(text, (char) => (char.length === 1 ? char.normalize("NFD")[0] : char)).join("");
}

function normalizeCodigo(raw: string): string | undefined {
  const withoutZeros = raw.replace(LEADING_ZEROS, "");
  if (!POSITIVE_INTEGER.test(withoutZeros) || withoutZeros.length > MAX_CODIGO_RENIPRESS_LENGTH) return undefined;
  return withoutZeros;
}

function tidy(value: string): string | undefined {
  const cleaned = value.replace(LEADING_SPACES_AND_PUNCTUATION, "").replace(TRAILING_SPACES_AND_HYPHENS, "").trim();
  return cleaned || undefined;
}

function plausibleNombre(value: string | undefined): string | undefined {
  if (!value || value.length > MAX_NOMBRE_ESTABLECIMIENTO_LENGTH || value.split(WHITESPACE_RUN).length > MAX_NOMBRE_ESTABLECIMIENTO_WORDS)
    return undefined;
  return value;
}

function fromQr(text: string, labelIndex: number, labelLength: number): InicioIncidencia | undefined {
  const before = text.slice(0, labelIndex);
  const word = INCIDENCIA_WORD.exec(fold(before));
  if (!word) return undefined;

  const after = text.slice(labelIndex + labelLength);
  const numeric = LEADING_NUMERIC_TOKEN.exec(after);
  const token = numeric ? numeric[1] : (LEADING_TOKEN.exec(after)?.[0] ?? "");
  if (!token) return undefined;

  const result: InicioIncidencia = { origen: IncidenciaOrigen.QR };
  const codigoRenipress = numeric ? normalizeCodigo(numeric[1]) : undefined;
  if (codigoRenipress) result.codigoRenipress = codigoRenipress;
  const nombre = plausibleNombre(tidy(before.slice(word.index + word[0].length)));
  if (nombre) result.nombre = nombre;
  const resto = tidy(after.slice(token.length));
  if (resto) result.resto = resto;
  return result;
}

function fromSentence(text: string, sentenceLength: number): InicioIncidencia {
  const result: InicioIncidencia = { origen: IncidenciaOrigen.TEXTO };
  const written = tidy(text.slice(sentenceLength));
  const nombre = plausibleNombre(tidy(written?.replace(LEADING_PREPOSITIONS, "") ?? ""));
  if (nombre) result.nombre = nombre;
  if (written) result.resto = written;
  return result;
}

export function parseInicioIncidencia(text: string): InicioIncidencia | undefined {
  const folded = fold(text);
  const label = CODIGO_IPRESS_LABEL.exec(folded);
  const qr = label ? fromQr(text, label.index, label[0].length) : undefined;
  if (qr) return qr;

  const sentence = INICIO_SENTENCE.exec(folded);
  if (sentence) return fromSentence(text, sentence[0].length);
  return undefined;
}

export function parseCodigoSuelto(text: string): string | undefined {
  const match = BARE_CODIGO.exec(fold(text));
  return match ? normalizeCodigo(match[1]) : undefined;
}

export function textoDeLaPersona(text: string): string {
  const inicio = parseInicioIncidencia(text);
  return inicio?.origen === IncidenciaOrigen.QR ? (inicio.resto ?? "") : text;
}
