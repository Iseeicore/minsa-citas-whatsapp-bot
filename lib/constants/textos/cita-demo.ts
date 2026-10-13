import { ANALYZING_CUENTA_TEXT } from "@/lib/constants/textos/cita-identidad";
import { DemoConfirmButtonId } from "@/lib/enums/demo-confirm-button-id";
import { SI_CONFIRMAR_BUTTON_TEXT } from "@/lib/constants/textos/comunes";

export const DEMO_ANALYZING_TEXT = `${ANALYZING_CUENTA_TEXT} cuenta con referencias:`;

export const demoHorasIntroText = (hospital: string, especialidad: string, horaInicio: string, horaFin: string): string =>
  `Listo, el establecimiento *${hospital}* cuenta con una referencia para ti.

Especialidad: ${especialidad}
Horario de atención: ${horaInicio} - ${horaFin} (turnos de 25 minutos)

¿A qué hora deseas tu cita? Elige un horario:`;

export const DEMO_HORAS_LIST_TEXT = "Horarios disponibles:";
export const DEMO_CONFIRM_QUESTION_TEXT = "¿Confirmas tu cita?";

export const demoResumenText = (especialidad: string, turno: string): string => `Especialidad: ${especialidad}
Turno seleccionado: ${turno}

${DEMO_CONFIRM_QUESTION_TEXT}`;

export const DEMO_CONFIRM_NO_BUTTON_TEXT = "No, elegir otra";

export const demoConstanciaDetalleText = (hospital: string, especialidad: string, turno: string): string => `Establecimiento: ${hospital}
Especialidad: ${especialidad}
Turno: ${turno}`;

export const DEMO_CONFIRM_BUTTONS = [
  { id: DemoConfirmButtonId.YES, title: SI_CONFIRMAR_BUTTON_TEXT },
  { id: DemoConfirmButtonId.NO, title: DEMO_CONFIRM_NO_BUTTON_TEXT },
];
