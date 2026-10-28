import { OtherEstablecimientoButtonId } from "@/lib/enums/other-establecimiento-button-id";
import { NO_SALIR_BUTTON_TEXT } from "@/lib/constants/textos/comunes";

export const SEARCHING_ESTABLECIMIENTOS_TEXT = "Buscando establecimientos…";
export const ESTABLECIMIENTO_DETECTED_LABEL_TEXT = "detectado";

export const especialidadNotAvailableText = (hint: string): string =>
  `La especialidad que mencionaste (${hint}) no está disponible por ahora, pero puedes elegir entre estas:`;

export const especialidadDetectedText = (nombre: string): string => `Especialidad detectada: *${nombre}*.`;
export const SELECT_ESPECIALIDAD_TEXT = "Selecciona la especialidad:";
export const especialidadesInDistritoText = (distrito: string): string =>
  `Entendido. Estas son las especialidades disponibles en *${distrito}*. Selecciona una:`;
export const ESTABLECIMIENTO_PAGE_PREV_TITLE_TEXT = "Ver anteriores";
export const ESTABLECIMIENTO_PAGE_NEXT_TITLE_TEXT = "Ver más establecimientos";
export const establecimientoChosenText = (label: string, nombre: string): string => `Establecimiento ${label}: *${nombre}*.`;
export const establecimientoConfirmText = (nombre: string): string =>
  `Encontramos este establecimiento: *${nombre}*.\n\n*¿Deseas agendar tu cita en este establecimiento?*`;
export const SELECT_ESTABLECIMIENTO_TEXT = "Selecciona el establecimiento:";
export const ESTABLECIMIENTOS_FOUND_TEXT = "Encontramos estos establecimientos:";
export const otherEstablecimientoQuestionText = (proposed: string): string => `¿Quieres buscar en *${proposed}*?`;
export const noFechasProposeText = (where: string, question: string): string => `No hay fechas disponibles en ${where}. ${question}`;

export const noFechasAlternativesText = (where: string, especialidad: string): string =>
  `No hay fechas disponibles en ${where}. Estos establecimientos también atienden ${especialidad}:`;

export const OTHER_ESTABLECIMIENTO_YES_BUTTON_TEXT = "Sí, buscar ahí";
export const THAT_ESTABLECIMIENTO_TEXT = "ese establecimiento";
export const THAT_ESPECIALIDAD_TEXT = "esa especialidad";
export const cuposText = (cupos: number): string => (cupos === 1 ? "1 cupo" : `${cupos} cupos`);

export const OTHER_ESTABLECIMIENTO_BUTTONS = [
  { id: OtherEstablecimientoButtonId.YES, title: OTHER_ESTABLECIMIENTO_YES_BUTTON_TEXT },
  { id: OtherEstablecimientoButtonId.NO, title: NO_SALIR_BUTTON_TEXT },
];

export const MEDICINA_GENERAL_ESPECIALIDAD_TEXT = "Medicina General";
