export const TURN_FAILURE_TEXT =
  "Ocurrió un inconveniente temporal al procesar tu solicitud. Por favor, intenta escribir nuevamente en unos instantes.";

export const INVALID_DOCUMENT_TEXT = "Documento inválido. Debe tener 8 dígitos. Intenta de nuevo.";

export type SearchSubject = "especialidades" | "establecimientos" | "fechas" | "horarios";

export const searchFailureText = (subject: SearchSubject): string =>
  `Ocurrió un error al buscar ${subject} disponibles. Intenta iniciar tu cita nuevamente en unos minutos.`;
