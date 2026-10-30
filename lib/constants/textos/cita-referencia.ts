import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";
import { OtherReferenciaButtonId } from "@/lib/enums/other-referencia-button-id";
import { SI_BUTTON_TEXT, NO_SALIR_BUTTON_TEXT } from "@/lib/constants/textos/comunes";

export const CITA_REFERENCIA_OTHER_BUTTONS = [
  { id: OtherReferenciaButtonId.YES, title: SI_BUTTON_TEXT },
  { id: OtherReferenciaButtonId.NO, title: NO_SALIR_BUTTON_TEXT },
];

export const CITA_REFERENCIA_CHANGE_BUTTON_TEXT = "Cambiar referencia";
export const CITA_REFERENCIA_CHANGE_PROMPT_TEXT = "También puedes elegir otra referencia.";
export const CITA_REFERENCIA_CHANGE_BUTTON = {
  id: ReferenciaActionButtonId.CHANGE,
  title: CITA_REFERENCIA_CHANGE_BUTTON_TEXT,
};

export const CITA_SIN_REFERENCIA_BUTTON_TEXT = "Cita sin referencia";
export const SALIR_BUTTON_TEXT = "Salir";
export const CONSULTA_REFERENCIAS_ACTIONS = [
  { id: ReferenciaActionButtonId.NEW_APPOINTMENT, title: CITA_SIN_REFERENCIA_BUTTON_TEXT },
  { id: ReferenciaActionButtonId.EXIT, title: SALIR_BUTTON_TEXT },
];
export const consultaReferenciasListText = (estados: readonly string[]): string =>
  `Estas son tus referencias. Para agendar una cita con una referencia, elígela de la lista: solo se pueden agendar las que están en estado ${estados.join(" o ")}. Si prefieres una cita sin referencia, elige «${CITA_SIN_REFERENCIA_BUTTON_TEXT}».`;
