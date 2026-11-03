import { ServiceOffer } from "@/lib/enums/service-offer";
import { MenuChoice } from "@/lib/enums/menu-choice";

export const welcomeMessageText = (
  portalUrl: string,
): string => `¡Hola! Te damos la bienvenida al canal oficial del *Ministerio de Salud del Perú (Minsa)* 🇵🇪.

⚠️ Si tienes una emergencia médica, llama al *106* (SAMU).

Si quieres agendar tu cita médica en menos de 2 minutos y sin colas entra a

${portalUrl}

¿Prefieres seguir por aquí mismo y ya tienes tu usuario de Minsa Digital?`;

export const WEB_WELCOME_MESSAGE_TEXT =
  "¡Hola! Soy tu asistente virtual. En caso de emergencia médica, llama al *106* (SAMU).\n¿En qué puedo ayudarte?";

export const WELCOME_CITA_BUTTON_TEXT = "Continuar mi cita";
export const WELCOME_CITA_BUTTON = { id: MenuChoice.AGENDAR_CITA, title: WELCOME_CITA_BUTTON_TEXT };
export const MENU_PROMPT_TEXT = "¿En qué podemos ayudarte hoy?";

export const MENU_ROW_CITA_TITLE = "Agendar una cita médica";
export const MENU_ROW_REGISTRAR_INCIDENCIA_TITLE = "Denuncia anticorrupción";
export const MENU_ROW_CONSULTAR_INCIDENCIA_TITLE = "Consultar mi denuncia";
export const MENU_ROW_CONSULTAR_REFERENCIA_TITLE = "Cita con referencia";
export const SERVICE_DISABLED_TEXT = "Por ahora solo puedo ayudarte a agendar una cita médica o una cita con referencia.";
export const SERVICE_DISABLED_CITA_TEXT = "Por ahora solo puedo ayudarte a agendar una cita médica.";
export const SERVICE_DISABLED_CITA_INCIDENCIA_TEXT =
  "Por ahora solo puedo ayudarte a agendar una cita médica o a registrar una denuncia anticorrupción.";
export const SERVICE_DISABLED_COMPLETA_TEXT =
  "Por ahora solo puedo ayudarte a agendar una cita médica, una cita con referencia o a registrar una denuncia anticorrupción.";
export const SERVICE_DISABLED_TEXTS: Readonly<Record<ServiceOffer, string>> = {
  [ServiceOffer.CITA]: SERVICE_DISABLED_CITA_TEXT,
  [ServiceOffer.CITA_REFERENCIA]: SERVICE_DISABLED_TEXT,
  [ServiceOffer.CITA_INCIDENCIA]: SERVICE_DISABLED_CITA_INCIDENCIA_TEXT,
  [ServiceOffer.COMPLETA]: SERVICE_DISABLED_COMPLETA_TEXT,
};

export const FIRST_CONTACT_LEAD_TEXT = "¡Hola!";

export const firstContactCitaRequestText = (what: string, where: string): string =>
  `¡Hola! Te ayudaremos a agendar tu cita${what}${where}. Para comenzar, por favor indícanos tu número de documento:`;

export const FIRST_CONTACT_CITA_TEXT = "¡Hola! Vamos a agendar tu cita. Para comenzar, por favor indícanos tu número de documento:";
export const OUT_OF_SCOPE_REQUEST_TEXT =
  "Solo puedo ayudarte a agendar una cita médica, una cita con referencia o a registrar una denuncia anticorrupción. Elige una opción:";
export const OUT_OF_SCOPE_REQUEST_CITA_REFERENCIA_TEXT =
  "Solo puedo ayudarte a agendar una cita médica o una cita con referencia. Elige una opción:";
export const OUT_OF_SCOPE_REQUEST_CITA_TEXT = "Solo puedo ayudarte a agendar una cita médica. Elige una opción:";
export const OUT_OF_SCOPE_REQUEST_CITA_INCIDENCIA_TEXT =
  "Solo puedo ayudarte a agendar una cita médica o a registrar una denuncia anticorrupción. Elige una opción:";
export const OUT_OF_SCOPE_REQUEST_TEXTS: Readonly<Record<ServiceOffer, string>> = {
  [ServiceOffer.CITA]: OUT_OF_SCOPE_REQUEST_CITA_TEXT,
  [ServiceOffer.CITA_REFERENCIA]: OUT_OF_SCOPE_REQUEST_CITA_REFERENCIA_TEXT,
  [ServiceOffer.CITA_INCIDENCIA]: OUT_OF_SCOPE_REQUEST_CITA_INCIDENCIA_TEXT,
  [ServiceOffer.COMPLETA]: OUT_OF_SCOPE_REQUEST_TEXT,
};
export const SANDBOX_PAGE_TITLE_TEXT = "Minsa Responde";
export const SANDBOX_PAGE_DESCRIPTION_TEXT = "Agenda tu cita o registra una denuncia anticorrupción con el Ministerio de Salud del Perú.";
export const SANDBOX_PAGE_DESCRIPTION_CITA_REFERENCIA_TEXT = "Agenda tu cita, con o sin referencia, con el Ministerio de Salud del Perú.";
export const SANDBOX_PAGE_DESCRIPTION_CITA_TEXT = "Agenda tu cita con el Ministerio de Salud del Perú.";
export const SANDBOX_PAGE_DESCRIPTION_TEXTS: Readonly<Record<ServiceOffer, string>> = {
  [ServiceOffer.CITA]: SANDBOX_PAGE_DESCRIPTION_CITA_TEXT,
  [ServiceOffer.CITA_REFERENCIA]: SANDBOX_PAGE_DESCRIPTION_CITA_REFERENCIA_TEXT,
  [ServiceOffer.CITA_INCIDENCIA]: SANDBOX_PAGE_DESCRIPTION_TEXT,
  [ServiceOffer.COMPLETA]: SANDBOX_PAGE_DESCRIPTION_TEXT,
};
export const CITA_INTENT_DETECTED_TEXT =
  "¡Entendido! Quieres agendar una cita médica. Antes de continuar necesito verificar tu identidad — ingresa tu número de documento.";
export const CONTINUE_BUTTON_ID = "continuar_menu";
export const citaRequestEspecialidadText = (especialidad: string): string => ` de ${especialidad}`;
export const citaRequestDistritoText = (distrito: string): string => ` en ${distrito}`;
