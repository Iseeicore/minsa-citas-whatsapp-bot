import { CitaReferenciaButtonId } from "@/lib/enums/cita-referencia-button-id";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";
import { OtherReferenciaButtonId } from "@/lib/enums/other-referencia-button-id";
import { OtherReferenciaCitaButtonId } from "@/lib/enums/other-referencia-cita-button-id";
import { SI_BUTTON_TEXT, NO_SALIR_BUTTON_TEXT } from "@/lib/constants/textos/comunes";

export const CITA_REFERENCIA_OTHER_BUTTONS = [
  { id: OtherReferenciaButtonId.YES, title: SI_BUTTON_TEXT },
  { id: OtherReferenciaButtonId.NO, title: NO_SALIR_BUTTON_TEXT },
];

export const CITA_REFERENCIA_SIN_FECHAS_TEXT =
  "No encontramos cupos disponibles para esta referencia. ¿Deseas continuar con tus referencias o con una cita médica?";
export const CITA_REFERENCIA_REFERENCES_BUTTON_TEXT = "Referencias";
export const CITA_REFERENCIA_NEW_APPOINTMENT_BUTTON_TEXT = "Cita médica";
export const CITA_REFERENCIA_SIN_FECHAS_BUTTONS = [
  { id: OtherReferenciaCitaButtonId.REFERENCES, title: CITA_REFERENCIA_REFERENCES_BUTTON_TEXT },
  { id: OtherReferenciaCitaButtonId.NEW_APPOINTMENT, title: CITA_REFERENCIA_NEW_APPOINTMENT_BUTTON_TEXT },
];

export const CITA_REFERENCIA_LOOKUP_ERROR_TEXT =
  "No pudimos consultar tus referencias en este momento. Esto no significa que no tengas referencias.";
export const CITA_REFERENCIA_LOOKUP_RETRY_QUESTION_TEXT = "Puedes reintentar la consulta o continuar con una nueva cita.";
export const CITA_REFERENCIA_NONE_TEXT = "No cuentas con referencias registradas. Continuaremos con una nueva cita.";
export const CITA_REFERENCIA_SIN_SELECCIONABLES_TEXT = "No tienes referencias disponibles para agendar. Continuaremos con una nueva cita.";
export const CITA_REFERENCIA_NEW_BUTTON_TEXT = "Nueva cita";
export const CITA_REFERENCIA_RETRY_BUTTON_TEXT = "Reintentar consulta";
export const CITA_REFERENCIA_CHANGE_BUTTON_TEXT = "Cambiar referencia";
export const CITA_REFERENCIA_CHANGE_PROMPT_TEXT = "También puedes elegir otra referencia.";
export const CITA_REFERENCIA_CHANGE_BUTTON = {
  id: ReferenciaActionButtonId.CHANGE,
  title: CITA_REFERENCIA_CHANGE_BUTTON_TEXT,
};

export const CITA_SIN_REFERENCIA_BUTTON_TEXT = "Cita sin referencia";
export const CONSULTA_REFERENCIAS_ACTIONS = [
  { id: ReferenciaActionButtonId.NEW_APPOINTMENT, title: CITA_SIN_REFERENCIA_BUTTON_TEXT },
  { id: ReferenciaActionButtonId.EXIT, title: "Salir" },
];
export const CITA_REFERENCIAS_ACTIONS = [{ id: ReferenciaActionButtonId.NEW_APPOINTMENT, title: CITA_SIN_REFERENCIA_BUTTON_TEXT }];
export const consultaReferenciasListText = (estados: readonly string[]): string =>
  `Estas son tus referencias. Para agendar una cita con una referencia, elígela de la lista: solo se pueden agendar las que están en estado ${estados.join(" o ")}. Si prefieres una cita sin referencia, elige «${CITA_SIN_REFERENCIA_BUTTON_TEXT}».`;

export const CITA_REFERENCIA_RETRY_BUTTONS = [
  { id: CitaReferenciaButtonId.RETRY, title: CITA_REFERENCIA_RETRY_BUTTON_TEXT },
  { id: CitaReferenciaButtonId.NEW, title: CITA_REFERENCIA_NEW_BUTTON_TEXT },
];
