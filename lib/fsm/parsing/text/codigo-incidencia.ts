import { CODIGO_EN_TEXTO, CODIGO_EXACTO, CONSULTA_KEYWORD, REGISTRO_KEYWORD } from "@/lib/constants/regex/incidencia";

export function extractCodigoIncidencia(text: string): string | null {
  const match = CODIGO_EN_TEXTO.exec(text);
  return match ? match[0].toUpperCase() : null;
}

export function parseCodigoIncidencia(text: string): string | null {
  const trimmed = text.trim();
  return CODIGO_EXACTO.test(trimmed) ? trimmed.toUpperCase() : null;
}

export function isConsultaKeyword(text: string): boolean {
  return CONSULTA_KEYWORD.test(text) && !REGISTRO_KEYWORD.test(text);
}
