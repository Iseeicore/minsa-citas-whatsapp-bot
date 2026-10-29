import { ASK_DOCUMENTO_TEXT } from "@/lib/constants/textos/identidad";
import { NO_BUTTON_TEXT, SI_BUTTON_TEXT } from "@/lib/constants/textos/comunes";
import { ReferenciaCitaOfferButtonId } from "@/lib/enums/referencia-cita-offer-button-id";
import { ReferenciaChoiceButtonId } from "@/lib/enums/referencia-choice-button-id";

export const REFERENCIA_LOGIN_REQUIRED_TEXT = `Para agendar una cita con referencia debes iniciar sesión. ${ASK_DOCUMENTO_TEXT}`;
export const REFERENCIA_NONE_TEXT = "No cuentas con referencias registradas.";
export const REFERENCIA_SIN_AGENDABLES_TEXT = "No cuentas con referencias que permitan agendar una cita.";
export const REFERENCIA_CITA_OFFER_QUESTION_TEXT = "¿Deseas agendar una cita?";
export const REFERENCIA_GOODBYE_TEXT =
  "Entendido. Cuando necesites agendar una cita, con o sin referencia, escríbenos. ¡Que tengas un buen día!";

export const REFERENCIA_CITA_OFFER_BUTTONS = [
  { id: ReferenciaCitaOfferButtonId.YES, title: SI_BUTTON_TEXT },
  { id: ReferenciaCitaOfferButtonId.NO, title: NO_BUTTON_TEXT },
];

export const REFERENCIA_CHOICE_QUESTION_TEXT =
  "Gestión de Referencias Médicas:\n\nPara una cita en hospital o instituto, tu centro de origen debe emitir la Hoja de Referencia (REFCON).\n\n¿Qué deseas hacer?";
export const CONSULTAR_REFERENCIA_BUTTON_TEXT = "Cita con referencia";
export const AGENDAR_CITA_BUTTON_TEXT = "Agendar cita";

export const REFERENCIA_CHOICE_BUTTONS = [
  { id: ReferenciaChoiceButtonId.CONSULTAR_REFERENCIA, title: CONSULTAR_REFERENCIA_BUTTON_TEXT },
  { id: ReferenciaChoiceButtonId.AGENDAR_CITA, title: AGENDAR_CITA_BUTTON_TEXT },
];
