import { ASK_DOCUMENTO_TEXT } from "@/lib/constants/textos/identidad";
import { NO_BUTTON_TEXT, SI_BUTTON_TEXT } from "@/lib/constants/textos/comunes";
import { ReferenciaCitaOfferButtonId } from "@/lib/enums/referencia-cita-offer-button-id";

export const REFERENCIA_LOGIN_REQUIRED_TEXT = `Para consultar tu referencia debes iniciar sesión. ${ASK_DOCUMENTO_TEXT}`;
export const REFERENCIA_NONE_TEXT = "No cuentas con referencias registradas.";
export const REFERENCIA_CITA_OFFER_QUESTION_TEXT = "¿Deseas agendar una cita?";
export const REFERENCIA_GOODBYE_TEXT =
  "Entendido. Cuando necesites consultar una referencia o agendar una cita, escríbenos. ¡Que tengas un buen día!";

export const REFERENCIA_CITA_OFFER_BUTTONS = [
  { id: ReferenciaCitaOfferButtonId.YES, title: SI_BUTTON_TEXT },
  { id: ReferenciaCitaOfferButtonId.NO, title: NO_BUTTON_TEXT },
];
