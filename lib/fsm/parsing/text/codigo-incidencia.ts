/** Código legible de una incidencia: MINSA-AAAA-NNNNNN (año de 4 dígitos y correlativo de 6). */
const CODIGO_EN_TEXTO = /(?<![A-Z0-9-])MINSA-\d{4}-\d{6}(?![A-Z0-9-])/i;
const CODIGO_EXACTO = /^MINSA-\d{4}-\d{6}$/i;

/** Busca un código completo dentro de una frase y lo devuelve en mayúsculas; null si no hay uno con el formato exacto. */
export function extractCodigoIncidencia(text: string): string | null {
  const match = CODIGO_EN_TEXTO.exec(text);
  return match ? match[0].toUpperCase() : null;
}

/** El texto es solamente un código (se toleran espacios alrededor). */
export function parseCodigoIncidencia(text: string): string | null {
  const trimmed = text.trim();
  return CODIGO_EXACTO.test(trimmed) ? trimmed.toUpperCase() : null;
}

const CONSULTA_KEYWORD = /\b(?:consultar|consulta|revisar|ver|saber|estado|seguimiento)\b.{0,30}\b(?:incidencia|reporte)\b/i;
const REGISTRO_KEYWORD = /\b(?:registrar|presentar|reportar|ingresar|denunciar)\b/i;

/** «quiero ver el estado de mi incidencia»: pide consultar, no registrar (si además pide registrar, gana el registro). */
export function isConsultaKeyword(text: string): boolean {
  return CONSULTA_KEYWORD.test(text) && !REGISTRO_KEYWORD.test(text);
}
