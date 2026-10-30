import { noPudimosLeerText } from "@/lib/constants/textos/comunes";
import { ConsultaEstablecimientoButtonId } from "@/lib/enums/consulta-establecimiento-button-id";
import { ConsultaTipoButtonId } from "@/lib/enums/consulta-tipo-button-id";
import { MAX_CONSULTAS_POR_DIA } from "@/lib/constants/limits/consulta";

export const ASK_TIPO_TEXT = "¿Tu denuncia fue anónima?";
export const TIPO_ANONIMA_BUTTON_TEXT = "Sí, anónima";
export const TIPO_CON_DNI_BUTTON_TEXT = "No, con DNI";
export const CONSULTA_TIPO_BUTTONS = [
  { id: ConsultaTipoButtonId.ANONIMA, title: TIPO_ANONIMA_BUTTON_TEXT },
  { id: ConsultaTipoButtonId.CON_DNI, title: TIPO_CON_DNI_BUTTON_TEXT },
];

export const CODIGO_EJEMPLO_ANONIMA = "MINSA-2026-A-000001";
export const CODIGO_EJEMPLO_CON_DNI = "MINSA-2026-000001";
export const SERIE_ANONIMA_TEXT = "anónima";
export const SERIE_CON_DNI_TEXT = "con DNI";
export const askCodigoText = (ejemplo: string): string => `Escribe el código de tu denuncia. Ejemplo: ${ejemplo}`;
export const invalidCodigoText = (ejemplo: string): string => `El código no tiene el formato correcto. Ejemplo: ${ejemplo}`;
export const otraSerieText = (serie: string, ejemplo: string): string => `Ese código es de una denuncia ${serie}. Ejemplo: ${ejemplo}`;
export const CODIGO_NO_RECONOCIDO_TEXT = "No pudimos reconocer el código. Revísalo e inicia la consulta nuevamente.";

export const ASK_ESTABLECIMIENTO_TEXT = "¿En qué establecimiento la registraste? Escribe su nombre o código IPRESS.";
export const ESTABLECIMIENTO_ILEGIBLE_TEXT = noPudimosLeerText(ASK_ESTABLECIMIENTO_TEXT);
export const confirmEstablecimientoText = (nombre: string, codigo: string): string => `¿Es este? *${nombre}* (IPRESS ${codigo})`;
export const ESTABLECIMIENTO_SI_BUTTON_TEXT = "Sí, es ese";
export const ESTABLECIMIENTO_NO_BUTTON_TEXT = "No, es otro";
export const CONSULTA_ESTABLECIMIENTO_BUTTONS = [
  { id: ConsultaEstablecimientoButtonId.SI, title: ESTABLECIMIENTO_SI_BUTTON_TEXT },
  { id: ConsultaEstablecimientoButtonId.NO, title: ESTABLECIMIENTO_NO_BUTTON_TEXT },
];
export const ESTABLECIMIENTO_NO_ENCONTRADO_TEXT = "No encontramos ese establecimiento. Escribe su nombre completo o su código IPRESS.";
export const ESTABLECIMIENTO_VARIOS_TEXT = "Hay varios establecimientos con ese nombre. Escribe el nombre completo o el código IPRESS.";
export const ESTABLECIMIENTO_RECHAZADO_TEXT = "Escribe el nombre completo o el código IPRESS del establecimiento.";
export const ESTABLECIMIENTO_AGOTADO_TEXT =
  "No pudimos ubicar el establecimiento. Revisa su nombre o código IPRESS e inicia la consulta nuevamente.";

export const ASK_DNI_TEXT = "Escribe el DNI con el que registraste la denuncia.";

export const BUSCANDO_INCIDENCIA_TEXT = "Buscando tu denuncia…";
export const incidenciaCodigoLineText = (codigo: string): string => `Denuncia ${codigo}`;
export const incidenciaEstadoLineText = (estado: string): string => `Estado: ${estado}`;
export const incidenciaFechaLineText = (fecha: string): string => `Registrada el ${fecha}`;
export const NO_UBICADA_TEXT = "No encontramos una denuncia con esos datos.";
export const consultasRestantesText = (restantes: number): string => {
  if (restantes <= 0) return "Ya no te quedan consultas hoy.";
  return restantes === 1 ? "Te queda 1 consulta hoy." : `Te quedan ${restantes} consultas hoy.`;
};
export const noUbicadaText = (restantes: number): string => `${NO_UBICADA_TEXT} ${consultasRestantesText(restantes)}`;
export const LIMITE_DIARIO_TEXT = `Ya usaste tus ${MAX_CONSULTAS_POR_DIA} consultas de hoy. Inténtalo mañana.`;
export const CONSULTA_FALLA_TEXT = "Disculpa, no podemos consultar tu denuncia en este momento. Inténtalo más tarde.";

export const ESTADO_REGISTRADA_TEXT = "Registrada";
export const ESTADO_EN_PROCESO_TEXT = "En proceso";
export const ESTADO_RESUELTA_TEXT = "Resuelta";
export const ESTADO_CERRADA_TEXT = "Cerrada";

export const ESTADO_LEGIBLE_TEXTS: Record<string, string> = {
  REGISTRADO: ESTADO_REGISTRADA_TEXT,
  CLASIFICADO: ESTADO_REGISTRADA_TEXT,
  DERIVADO: ESTADO_EN_PROCESO_TEXT,
  EN_GESTION: ESTADO_EN_PROCESO_TEXT,
  RESUELTO: ESTADO_RESUELTA_TEXT,
  ARCHIVADO: ESTADO_CERRADA_TEXT,
  ANULADO: ESTADO_CERRADA_TEXT,
};
