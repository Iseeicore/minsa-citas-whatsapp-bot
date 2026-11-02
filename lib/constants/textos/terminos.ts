import { DocumentoAceptacion } from "@/lib/enums/documento-aceptacion";
import { TerminosButtonId } from "@/lib/enums/terminos-button-id";
import { DATOS_PERSONALES_CHECKBOX_LABEL } from "@/lib/constants/textos/datos-personales";
import type { ConsentButtons, ConsentCheck } from "@/lib/fsm/core/types";

export const TERMINOS_VERSION = "2026-10-29";
export const TERMINOS_CONTENIDO = "";
export const TERMINOS_TITULO_TEXT = "Términos y condiciones";
export const DOCUMENTOS_TITULO_TEXT = "Términos y protección de datos personales";
export const TERMINOS_PROMPT_TEXT =
  "Antes de agendar tu cita, revisa y acepta los términos y condiciones y la protección de datos personales.";
export const TERMINOS_PRIVACIDAD_WHATSAPP_TEXT =
  "Por WhatsApp solo recibimos tu número y los mensajes que nos envías para atenderte. Meta no comparte con el Minsa tu dirección IP.";
export const terminosWhatsappBodyText = (prompt: string): string => `${prompt}\n\n${TERMINOS_PRIVACIDAD_WHATSAPP_TEXT}`;
export const TERMINOS_VER_BUTTON_TEXT = "Ver documentos";
export const TERMINOS_ACEPTO_BUTTON_TEXT = "Acepto ambos";
export const TERMINOS_NO_ACEPTO_BUTTON_TEXT = "No acepto";
export const TERMINOS_BUTTONS: ConsentButtons = [
  { id: TerminosButtonId.ACCEPT, title: TERMINOS_ACEPTO_BUTTON_TEXT },
  { id: TerminosButtonId.DECLINE, title: TERMINOS_NO_ACEPTO_BUTTON_TEXT },
];
export const TERMINOS_CHECKBOX_LABEL = "Acepto los términos y condiciones";
export const TERMINOS_CHECKS: readonly ConsentCheck[] = [
  { id: DocumentoAceptacion.TERMINOS, label: TERMINOS_CHECKBOX_LABEL },
  { id: DocumentoAceptacion.DATOS_PERSONALES, label: DATOS_PERSONALES_CHECKBOX_LABEL },
];
export const TERMINOS_ACCEPT_LABEL = "Continuar";
export const TERMINOS_REOPEN_LABEL = "Revisar términos y datos personales";
export const TERMINOS_RECHAZADOS_TEXT =
  "Lo sentimos. Muchas gracias por usar nuestros servicios.\n\nPara agendar una cita es necesario aceptar los términos y condiciones y autorizar el tratamiento de tus datos personales. Cuando quieras, escríbenos de nuevo. ¡Hasta pronto!";
