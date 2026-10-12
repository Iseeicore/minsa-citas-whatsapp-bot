import { ExitButtonId } from "@/lib/enums/exit-button-id";

export const CITA_FAREWELL_TEXT = "Gracias por comunicarte con el *Ministerio de Salud del Perú*. Cuando quieras volver a intentarlo, escríbenos nuevamente. ¡Que tengas un buen día! 👋";
export const CITA_BOOKED_FAREWELL_TEXT = "Gracias por comunicarte con el *Ministerio de Salud del Perú*. Si necesitas agendar otra cita o realizar una consulta, escríbenos nuevamente cuando lo necesites. ¡Que tengas un buen día! 👋";
export const EXIT_QUESTION_TEXT = "Parece que prefieres no continuar con tu cita. Entiendo que pueda ser frustrante. ¿Deseas salir?";
export const EXIT_YES_BUTTON_TEXT = "Sí, salir";
export const EXIT_NO_BUTTON_TEXT = "No, continuar";
export const CITA_ABANDONED_TEXT = "Entendido. Cuando quieras retomar tu cita, escríbenos. ¡Que tengas un buen día! 👋";

export const EXIT_BUTTONS = [
  { id: ExitButtonId.YES, title: EXIT_YES_BUTTON_TEXT },
  { id: ExitButtonId.NO, title: EXIT_NO_BUTTON_TEXT },
];
