import { CODIGO_ANONIMO, CODIGO_EN_TEXTO, CODIGO_EXACTO, CONSULTA_KEYWORD, REGISTRO_KEYWORD } from "@/lib/constants/regex/incidencia";

export function extractCodigoIncidencia(text: string): string | undefined {
  const match = CODIGO_EN_TEXTO.exec(text);
  return match ? match[0].toUpperCase() : undefined;
}

export function parseCodigoIncidencia(text: string): string | undefined {
  const trimmed = text.trim();
  return CODIGO_EXACTO.test(trimmed) ? trimmed.toUpperCase() : undefined;
}

export function isCodigoAnonimo(codigo: string): boolean {
  return CODIGO_ANONIMO.test(codigo.trim());
}

export function isConsultaKeyword(text: string): boolean {
  return CONSULTA_KEYWORD.test(text) && !REGISTRO_KEYWORD.test(text);
}
