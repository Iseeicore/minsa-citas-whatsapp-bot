import { ASK_DOCUMENTO_TEXT } from "@/lib/constants/textos/identidad";
import { ConsultaCodigoButtonId } from "@/lib/enums/consulta-codigo-button-id";

export const ASK_CODIGO_TEXT = "Escribe el código de tu denuncia (por ejemplo, MINSA-2026-000001).";
export const ASK_CODIGO_O_LISTAR_TEXT = "¿Tienes el código, o prefieres ver todas tus denuncias registradas?";
export const LISTAR_BUTTON_TEXT = "Ver mis denuncias";
export const INVALID_CODIGO_TEXT = "El código no tiene el formato correcto. Debe verse así: MINSA-2026-000001. Intenta de nuevo.";
export const CODIGO_NO_RECONOCIDO_TEXT = "No pudimos reconocer el código. Revísalo e inicia la consulta nuevamente.";
export const CONSULTA_ASK_DOCUMENTO_TEXT = `Para consultar tu denuncia necesito verificar tu identidad. ${ASK_DOCUMENTO_TEXT}`;
export const NO_VERIFICADO_TEXT = "No pudimos verificar tu identidad. Revisa tu número de documento o inténtalo más tarde.";
export const OTP_BLOQUEADO_TEXT = "Superaste el número de intentos permitidos. Inténtalo nuevamente más tarde.";
export const BUSCANDO_INCIDENCIA_TEXT = "Buscando tu denuncia…";
export const BUSCANDO_INCIDENCIAS_TEXT = "Buscando tus denuncias…";
export const incidenciaCodigoLineText = (codigo: string): string => `Denuncia ${codigo}`;
export const incidenciaEstadoLineText = (estado: string): string => `Estado: ${estado}`;
export const incidenciaFechaLineText = (fecha: string): string => `Fecha de registro: ${fecha}`;
export const NO_UBICADA_TEXT = "No se logró ubicar el registro de la denuncia.";
export const SIN_INCIDENCIAS_TEXT = "No tienes denuncias registradas.";
export const INCIDENCIAS_LIST_TEXT = "Estas son tus denuncias:";
export const CONSULTA_FALLA_TEXT = "Disculpa, no podemos consultar tu denuncia en este momento. Inténtalo más tarde.";
export const ESTADO_RECIBIDA_TEXT = "Recibida, pendiente de revisión";

export const ESTADO_LEGIBLE_TEXTS: Record<string, string> = {
  REGISTRADO: ESTADO_RECIBIDA_TEXT,
  CLASIFICADO: ESTADO_RECIBIDA_TEXT,
  DERIVADO: "Derivada al área responsable",
  EN_GESTION: "En atención por el área responsable",
  RESUELTO: "Resuelta",
  ARCHIVADO: "Archivada",
  ANULADO: "Cerrada",
};

export const ESTADO_EN_PROCESO_TEXT = "En proceso";
export const LISTAR_BUTTONS = [{ id: ConsultaCodigoButtonId.LISTAR, title: LISTAR_BUTTON_TEXT }];
