import { MenuChoice } from "@/lib/enums/menu-choice";

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

export const MENU_ROWS = [
  { id: MenuChoice.AGENDAR_CITA, title: "Agendar una cita médica" },
  { id: MenuChoice.REGISTRAR_INCIDENCIA, title: "Registrar una incidencia" },
  { id: MenuChoice.CONSULTAR_INCIDENCIA, title: "Consultar una incidencia" },
];

export const NUMERIC_MENU_CHOICES: Record<string, MenuChoice> = {
  "1": MenuChoice.AGENDAR_CITA,
  "2": MenuChoice.REGISTRAR_INCIDENCIA,
  "3": MenuChoice.CONSULTAR_INCIDENCIA,
};

export const FIRST_CONTACT_LEAD_TEXT = "¡Hola!";

export const firstContactCitaRequestText = (what: string, where: string): string =>
  `¡Hola! Te ayudaremos a agendar tu cita${what}${where}. Para comenzar, por favor indícanos tu número de documento:`;

export const FIRST_CONTACT_CITA_TEXT = "¡Hola! Vamos a agendar tu cita. Para comenzar, por favor indícanos tu número de documento:";
export const REVIEWING_MESSAGE_TEXT = "Un momento, estamos revisando tu mensaje…";
export const OUT_OF_SCOPE_REQUEST_TEXT = "Solo puedo ayudarte a agendar una cita médica o a registrar una incidencia. Elige una opción:";
export const CITA_INTENT_DETECTED_TEXT =
  "¡Entendido! Quieres agendar una cita médica. Antes de continuar necesito verificar tu identidad — ingresa tu número de documento.";
export const CONTINUE_BUTTON_ID = "continuar_menu";
export const citaRequestEspecialidadText = (especialidad: string): string => ` de ${especialidad}`;
export const citaRequestDistritoText = (distrito: string): string => ` en ${distrito}`;
