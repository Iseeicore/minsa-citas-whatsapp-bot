export const WELCOME_MESSAGE_TEXT = `¡Hola! Te damos la bienvenida al canal oficial del *Ministerio de Salud del Perú (MINSA)* 🇵🇪.

Para agendar tu cita médica de manera rápida en menos de 2 minutos, elegir tu establecimiento de salud y obtener tu ticket de atención sin colas, abre *MINSA Digital*.

Encuentra citas para Medicina General, Odontología, Pediatría y más especialidades a nivel nacional.

⚠️ En caso de emergencia médica, llama al *106* (SAMU).

¿Prefieres seguir por aquí mismo? Escríbeme lo que necesitas y te ayudo.`;

export const WEB_WELCOME_MESSAGE_TEXT = `¡Hola! Soy el asistente virtual de MINSA Digital 🇵🇪. Puedo ayudarte a agendar tu cita médica, elegir tu establecimiento de salud y obtener tu ticket de atención, todo desde este mismo chat.

Encuentra citas para Medicina General, Odontología, Pediatría y más especialidades a nivel nacional.

⚠️ En caso de emergencia médica, llama al *106* (SAMU).

Escríbeme lo que necesitas y te ayudo.`;

export const WELCOME_CTA_BUTTON_TEXT = "Continuar mi cita";
export const MENU_PROMPT_TEXT = "¿En qué podemos ayudarte hoy?";

export const MENU_ROW_CITA_TITLE = "Agendar una cita médica";
export const MENU_ROW_REGISTRAR_INCIDENCIA_TITLE = "Registrar una incidencia";
export const MENU_ROW_CONSULTAR_INCIDENCIA_TITLE = "Consultar una incidencia";
export const MENU_ROW_CONSULTAR_REFERENCIA_TITLE = "Consultar referencia";
export const SERVICE_DISABLED_TEXT = "Por ahora solo puedo ayudarte a agendar una cita médica.";
export const SERVICE_DISABLED_WEB_TEXT = "Por ahora solo puedo ayudarte a agendar una cita médica o a consultar una referencia.";

export const FIRST_CONTACT_LEAD_TEXT = "¡Hola!";

export const firstContactCitaRequestText = (what: string, where: string): string =>
  `¡Hola! Te ayudaremos a agendar tu cita${what}${where}. Para comenzar, por favor indícanos tu número de documento:`;

export const FIRST_CONTACT_CITA_TEXT = "¡Hola! Vamos a agendar tu cita. Para comenzar, por favor indícanos tu número de documento:";
export const REVIEWING_MESSAGE_TEXT = "Un momento, estamos revisando tu mensaje…";
export const OUT_OF_SCOPE_REQUEST_TEXT = "Solo puedo ayudarte a agendar una cita médica o a registrar una incidencia. Elige una opción:";
export const OUT_OF_SCOPE_REQUEST_ONLY_CITA_TEXT = "Solo puedo ayudarte a agendar una cita médica. Elige una opción:";
export const OUT_OF_SCOPE_REQUEST_CITA_REFERENCIA_TEXT =
  "Solo puedo ayudarte a agendar una cita médica o a consultar una referencia. Elige una opción:";
export const SANDBOX_PAGE_TITLE_TEXT = "MINSA Digital";
export const SANDBOX_PAGE_DESCRIPTION_TEXT = "Agenda tu cita o registra una incidencia con el Ministerio de Salud del Perú.";
export const SANDBOX_PAGE_DESCRIPTION_CITA_REFERENCIA_TEXT = "Agenda tu cita o consulta tu referencia con el Ministerio de Salud del Perú.";
export const CITA_INTENT_DETECTED_TEXT =
  "¡Entendido! Quieres agendar una cita médica. Antes de continuar necesito verificar tu identidad — ingresa tu número de documento.";
export const CONTINUE_BUTTON_ID = "continuar_menu";
export const citaRequestEspecialidadText = (especialidad: string): string => ` de ${especialidad}`;
export const citaRequestDistritoText = (distrito: string): string => ` en ${distrito}`;
