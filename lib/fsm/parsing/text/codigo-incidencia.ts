const CODIGO_EN_TEXTO = /(?<![A-Z0-9-])MINSA-\d{4}-\d{6}(?![A-Z0-9-])/i;
const CODIGO_EXACTO = /^MINSA-\d{4}-\d{6}$/i;

export function extractCodigoIncidencia(text: string): string | null {
  const match = CODIGO_EN_TEXTO.exec(text);
  return match ? match[0].toUpperCase() : null;
}

export function parseCodigoIncidencia(text: string): string | null {
  const trimmed = text.trim();
  return CODIGO_EXACTO.test(trimmed) ? trimmed.toUpperCase() : null;
}

const CONSULTA_KEYWORD = /\b(?:consultar|consulta|revisar|ver|saber|estado|seguimiento)\b.{0,30}\b(?:incidencia|reporte)\b/i;
const REGISTRO_KEYWORD = /\b(?:registrar|presentar|reportar|ingresar|denunciar)\b/i;

export function isConsultaKeyword(text: string): boolean {
  return CONSULTA_KEYWORD.test(text) && !REGISTRO_KEYWORD.test(text);
}
