import { TerminosButtonId } from "@/lib/enums/terminos-button-id";

export const TERMINOS_VERSION = "2026-10-29";
export const TERMINOS_CONTENIDO = "";
export const TERMINOS_TITULO_TEXT = "Términos y condiciones";
export const TERMINOS_PROMPT_TEXT = "Antes de agendar tu cita, revisa y acepta los términos y condiciones.";
export const TERMINOS_PRIVACIDAD_WHATSAPP_TEXT =
  "Por WhatsApp solo recibimos tu número y los mensajes que nos envías para atenderte. Meta no comparte con el MINSA tu dirección IP.";
export const terminosWhatsappBodyText = (prompt: string): string => `${prompt}\n\n${TERMINOS_PRIVACIDAD_WHATSAPP_TEXT}`;
export const TERMINOS_VER_BUTTON_TEXT = "Ver términos";
export const TERMINOS_ACEPTO_BUTTON_TEXT = "Acepto";
export const TERMINOS_NO_ACEPTO_BUTTON_TEXT = "No acepto";
export const TERMINOS_BUTTONS = [
  { id: TerminosButtonId.ACCEPT, title: TERMINOS_ACEPTO_BUTTON_TEXT },
  { id: TerminosButtonId.DECLINE, title: TERMINOS_NO_ACEPTO_BUTTON_TEXT },
];
export const TERMINOS_RECHAZADOS_TEXT =
  "Lo sentimos. Muchas gracias por usar nuestros servicios.\n\nPara agendar una cita es necesario aceptar los términos y condiciones. Cuando quieras, escríbenos de nuevo. ¡Hasta pronto!";
