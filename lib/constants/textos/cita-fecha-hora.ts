import { SELECTION_REJECTION_TEXT, NO_SALIR_BUTTON_TEXT, SI_CONFIRMAR_BUTTON_TEXT } from "@/lib/constants/textos/comunes";
import { CITA_FAREWELL_TEXT } from "@/lib/constants/textos/cita-salida";
import { OtherFechaButtonId } from "@/lib/enums/other-fecha-button-id";
import { HoraConfirmButtonId } from "@/lib/enums/hora-confirm-button-id";

export const SEARCHING_FECHAS_TEXT = "Buscando fechas disponibles…";
export const SEARCHING_HORARIOS_TEXT = "Buscando horarios disponibles…";
export const fechaFoundText = (fecha: string): string => `Fecha encontrada: ${fecha}. ${SEARCHING_HORARIOS_TEXT}`;
export const FECHA_NOT_IDENTIFIED_TEXT = `No pudimos identificar esa fecha. ${SELECTION_REJECTION_TEXT}`;
export const cuposDisponiblesText = (cupos: number): string => `${cupos} cupo(s) disponibles`;
export const SELECT_FECHA_TEXT = "Selecciona la fecha:";
export const noCuposForFechaText = (fecha: string): string => `No hay cupos para ${fecha}. Elige una de las fechas disponibles:`;
export const OTHER_FECHA_DECLINED_TEXT = `Entendido, no buscaremos otra fecha por ahora. ${CITA_FAREWELL_TEXT}`;
export const OTHER_FECHA_NO_DATES_TEXT = `Lamentamos informarte que por ahora no hay otras fechas disponibles en este establecimiento. ${CITA_FAREWELL_TEXT}`;
export const REFERENCIA_SIN_CUPOS_TEXT = `Lo sentimos mucho. Para tu referencia médica no encontramos cupos disponibles en nuestro canal en este momento. Te recomendamos comunicarte con tu centro de salud principal para que te derive a otra área. ${CITA_FAREWELL_TEXT}`;
export const OTHER_FECHA_ONLY_DECLINED_INTRO_TEXT =
  "Entendido, ese horario no te conviene. Como era el único horario disponible para esa fecha, te recomiendo elegir otra fecha.";
export const OTHER_FECHA_NO_HORARIOS_INTRO_TEXT = "No hay horarios disponibles para esa fecha.";
export const OTHER_FECHA_QUESTION_TEXT = "¿Deseas cambiar de fecha?\n\n[1] Sí, cambiar de fecha\n[2] No, salir";
export const OTHER_FECHA_YES_BUTTON_TEXT = "Sí, otra fecha";
export const SEARCHING_OTHER_FECHAS_TEXT = "Buscando otras fechas disponibles…";
export const onlyHoraConfirmText = (range: string): string => `Solo hay un horario disponible: ${range}. ¿Lo confirmas?`;
export const horaConfirmText = (range: string): string => `¿Confirmas el horario ${range}?`;
export const ONLY_HORA_NO_BUTTON_TEXT = "No, gracias";
export const HORA_CONFIRM_NO_BUTTON_TEXT = "No, ver horarios";
export const HORA_CHOICE_PROMPT_TEXT = "Elige una de las dos opciones:";
export const horaOptionText = (hora: string): string => `Opción: ${hora}`;
export const SEE_HORAS_BUTTON_TEXT = "Ver horas";
export const CHOOSE_OTHER_HORA_TEXT = "Sin problema. Elige otro horario:";
export const SELECT_HORA_TEXT = "Selecciona el horario:";
export const HORA_PAGE_PREV_BUTTON_TEXT = "Horarios anteriores";
export const HORA_PAGE_NEXT_BUTTON_TEXT = "Ver más horarios";
export const HORA_PAGE_QUESTION_TEXT = "¿Quieres ver otros horarios de esta especialidad?";
export const SEARCHING_MORE_HORARIOS_TEXT = "Buscando más horarios…";
export const hourGroupSeeHorasText = (hourGroup: string): string => `${hourGroup}: ver horas`;
export const numberedHoraOptionText = (position: number, hora: string): string => `Opción ${position}: ${hora}`;

export const bareNumberQuestionText = (position: number, hora: string, hourDescription: string): string =>
  `¿A qué te refieres con "${position}"? ${numberedHoraOptionText(position, hora)}, o ${hourDescription}.`;

export const HORA_UNAVAILABLE_TEXT = "No hay horarios disponibles a esa hora. Elige uno de la lista:";

export const OTHER_FECHA_BUTTONS = [
  { id: OtherFechaButtonId.YES, title: OTHER_FECHA_YES_BUTTON_TEXT },
  { id: OtherFechaButtonId.NO, title: NO_SALIR_BUTTON_TEXT },
];

export const ONLY_HORA_CONFIRM_BUTTONS = [
  { id: HoraConfirmButtonId.YES, title: SI_CONFIRMAR_BUTTON_TEXT },
  { id: HoraConfirmButtonId.NO, title: ONLY_HORA_NO_BUTTON_TEXT },
];

export const HORA_CONFIRM_BUTTONS = [
  { id: HoraConfirmButtonId.YES, title: SI_CONFIRMAR_BUTTON_TEXT },
  { id: HoraConfirmButtonId.NO, title: HORA_CONFIRM_NO_BUTTON_TEXT },
];

export const WEEKDAY_NAMES_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const WEEKDAY_NAMES_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export const MONTH_NAMES_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export const MONTH_NAMES_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const longDateText = (weekday: string, day: number, month: string): string => `${weekday} ${day} de ${month}`;
export const dayLabelText = (day: string | number): string => `el ${day}`;
