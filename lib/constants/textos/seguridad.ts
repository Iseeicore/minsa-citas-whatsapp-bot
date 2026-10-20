import { CONTINUE_BUTTON_ID } from "@/lib/constants/textos/menu";

export const RESPECT_REMINDER_TEXT =
  "Le recordamos que este es un canal institucional oficial del MINSA y mantenemos una política de respeto.";
export const INSTITUTIONAL_WARNING_TEXT = `${RESPECT_REMINDER_TEXT} Si desea registrar una incidencia sobre un mal servicio de salud, escriba INCIDENCIA para iniciar el trámite oficial.`;
export const CITA_WITH_WARNING_TEXT = `${RESPECT_REMINDER_TEXT} Continuemos con tu cita: ingresa tu número de documento.`;
export const CONTINUE_BUTTON_TEXT = "Continuar";
export const FORCED_INCIDENCIA_LEAD_TEXT = "Lamentamos lo ocurrido.";
export const FIRST_MESSAGE_REJECTION_TEXT =
  "Mensaje no reconocido. El asistente del MINSA solo atiende solicitudes de citas médicas, consulta de referencias y registro de incidencias. Por favor elija una opción: [1] Citas [2] Referencia [3] Incidencias.";
export const FIRST_MESSAGE_REJECTION_CITA_REFERENCIA_TEXT =
  "Mensaje no reconocido. El asistente del MINSA solo atiende solicitudes de citas médicas y consulta de referencias. Por favor elija una opción: [1] Citas [2] Referencia.";
export const MEDIA_WITHOUT_SESSION_TEXT =
  "Hola. Para iniciar su atención con el asistente del MINSA, por favor escriba un mensaje de texto con la palabra HOLA o seleccione una opción del menú.";
export const muteNoticeText = (minutes: number): string =>
  `Está enviando mensajes muy rápido. Por favor, espere ${minutes} minutos y vuelva a escribirnos.`;
export const CONTINUE_BUTTONS = [{ id: CONTINUE_BUTTON_ID, title: CONTINUE_BUTTON_TEXT }];
