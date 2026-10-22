import { CitaReferenciaButtonId } from "@/lib/enums/cita-referencia-button-id";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";
import { OtherReferenciaButtonId } from "@/lib/enums/other-referencia-button-id";
import { SI_BUTTON_TEXT, NO_SALIR_BUTTON_TEXT } from "@/lib/constants/textos/comunes";

export const CITA_REFERENCIA_OTHER_BUTTONS = [
  { id: OtherReferenciaButtonId.YES, title: SI_BUTTON_TEXT },
  { id: OtherReferenciaButtonId.NO, title: NO_SALIR_BUTTON_TEXT },
];

export const CITA_REFERENCIA_MODE_QUESTION_TEXT = "Tienes referencias registradas. ¿Cómo deseas agendar tu cita?";
export const CITA_REFERENCIA_LOOKUP_ERROR_TEXT =
  "No pudimos consultar tus referencias en este momento. Esto no significa que no tengas referencias.";
export const CITA_REFERENCIA_LOOKUP_RETRY_QUESTION_TEXT = "Puedes reintentar la consulta o continuar con una nueva cita.";
export const CITA_REFERENCIA_NONE_TEXT = "No cuentas con referencias registradas. Continuaremos con una nueva cita.";
export const CITA_REFERENCIA_NEW_BUTTON_TEXT = "Nueva cita";
export const CITA_REFERENCIA_USE_BUTTON_TEXT = "Cita con referencia";
export const CITA_REFERENCIA_RETRY_BUTTON_TEXT = "Reintentar consulta";
export const CITA_REFERENCIA_CHANGE_BUTTON_TEXT = "Cambiar referencia";
export const CITA_REFERENCIA_CHANGE_PROMPT_TEXT = "También puedes elegir otra referencia.";
export const CITA_REFERENCIA_CHANGE_BUTTON = {
  id: ReferenciaActionButtonId.CHANGE,
  title: CITA_REFERENCIA_CHANGE_BUTTON_TEXT,
};

export const CITA_REFERENCIA_MODE_BUTTONS = [
  { id: CitaReferenciaButtonId.NEW, title: CITA_REFERENCIA_NEW_BUTTON_TEXT },
  { id: CitaReferenciaButtonId.REFERENCE, title: CITA_REFERENCIA_USE_BUTTON_TEXT },
];

export const CITA_REFERENCIA_RETRY_BUTTONS = [
  { id: CitaReferenciaButtonId.RETRY, title: CITA_REFERENCIA_RETRY_BUTTON_TEXT },
  { id: CitaReferenciaButtonId.NEW, title: CITA_REFERENCIA_NEW_BUTTON_TEXT },
];
