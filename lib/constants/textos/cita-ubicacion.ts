import { noPudimosLeerText, NO_SALIR_BUTTON_TEXT } from "@/lib/constants/textos/comunes";
import { OtherDistritoButtonId } from "@/lib/enums/other-distrito-button-id";

export const ASK_DISTRITO_TEXT = 'Cuéntanos en qué distrito buscas atención (ej. "Miraflores").';
export const ASK_DISTRITO_NOMBRE_TEXT = "Cuéntanos el nombre del distrito.";
export const ASK_DEPARTAMENTO_TEXT = "Indícanos el departamento.";
export const ASK_PROVINCIA_TEXT = "Indícanos la provincia.";
export const ASK_PROVINCIA_QUESTION_TEXT = "¿En qué provincia?";
export const ASK_DISTRITO_MANUAL_TEXT = "Indícanos el distrito.";
export const ASK_DISTRITO_QUESTION_TEXT = "¿En qué distrito?";
export const UNREADABLE_DEPARTAMENTO_TEXT = noPudimosLeerText(ASK_DEPARTAMENTO_TEXT);
export const UNREADABLE_PROVINCIA_TEXT = noPudimosLeerText(ASK_PROVINCIA_QUESTION_TEXT);
export const UNREADABLE_DISTRITO_TEXT = noPudimosLeerText(ASK_DISTRITO_MANUAL_TEXT);
export const SEARCHING_UBIGEO_TEXT = "Buscando tu ubigeo…";
export const UBIGEO_ERROR_TEXT = "Ocurrió un error al buscar tu ubigeo. Indícanos nuevamente el departamento.";
export const UBIGEO_NOT_FOUND_TEXT = "No encontramos ese ubigeo. Indícanos nuevamente el departamento.";
export const SEARCHING_ESPECIALIDADES_TEXT = "Buscando especialidades disponibles…";
export const searchingCatalogInText = (lugar: string): string => `Entendido. Buscando especialidades y citas disponibles en *${lugar}*…`;
export const SELECT_UBIGEO_TEXT = "Selecciona tu ubigeo:";
export const DISTRITO_MANUAL_FALLBACK_TEXT =
  "No pudimos identificar tu distrito en este momento. Vamos por partes: indícanos el departamento donde buscas atención.";
export const DISTRITO_TOO_MANY_MATCHES_TEXT =
  "Encontramos demasiadas coincidencias para mostrarlas en una lista, vamos a pedirlo por partes. Indícanos el departamento donde buscas atención.";
export const DISTRITO_DISAMBIGUATION_TEXT = "Encontramos varias opciones. ¿Cuál es tu distrito?";
export const searchingDistritoText = (distrito: string): string => `Buscando tu distrito: "${distrito}"…`;
export const UNRECOGNIZED_DISTRITO_TEXT = "No reconocimos ese distrito. Por favor escribe el nombre de tu distrito o comuna:";
export const NATIONAL_REDIRECT_BUTTON_TEXT = "Cita Nivel Global";

export const nationalRedirectForText = (places: string): string =>
  `Por ahora estamos en una etapa inicial y el agendamiento automático por este canal solo está disponible en ${places}. Para tu distrito, continúa tu cita a nivel nacional en MINSA Responde.`;

export const OTHER_DISTRITO_QUESTION_TEXT = "¿Deseas buscar en otro distrito cercano?\n\n[1] Sí, buscar otro distrito\n[2] No, salir";
export const noCoverageText = (what: string, where: string): string =>
  `No encontramos ${what} disponibles ${where} en este momento.\n${OTHER_DISTRITO_QUESTION_TEXT}`;

export const CHANGE_DISTRITO_TEXT = `Entiendo que esa ubicación no te sirve, a veces las cosas no salen como esperamos.
${OTHER_DISTRITO_QUESTION_TEXT}`;

export const OTHER_DISTRITO_YES_BUTTON_TEXT = "Sí, otro distrito";
export const noCoverageInPlaceText = (lugar: string): string => `en *${lugar}*`;
export const NO_COVERAGE_IN_YOUR_AREA_TEXT = "en tu zona";
export const NO_COVERAGE_ESPECIALIDADES_TEXT = "especialidades";
export const NO_COVERAGE_ESTABLECIMIENTOS_TEXT = "establecimientos para esa especialidad";
export const ASK_OTHER_DISTRITO_TEXT = 'Perfecto. Cuéntanos en qué otro distrito buscas atención (ej. "Miraflores").';

export const OTHER_DISTRITO_BUTTONS = [
  { id: OtherDistritoButtonId.YES, title: OTHER_DISTRITO_YES_BUTTON_TEXT },
  { id: OtherDistritoButtonId.NO, title: NO_SALIR_BUTTON_TEXT },
];
