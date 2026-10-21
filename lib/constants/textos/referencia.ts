import { ASK_DOCUMENTO_TEXT } from "@/lib/constants/textos/identidad";
import { NO_BUTTON_TEXT, SI_BUTTON_TEXT } from "@/lib/constants/textos/comunes";
import { ReferenciaCitaOfferButtonId } from "@/lib/enums/referencia-cita-offer-button-id";
import { ReferenciaChoiceButtonId } from "@/lib/enums/referencia-choice-button-id";
import { ReferenciaEleccionButtonId } from "@/lib/enums/referencia-eleccion-button-id";
import { ReferenciaSinCuposButtonId } from "@/lib/enums/referencia-sin-cupos-button-id";

export const REFERENCIA_LOGIN_REQUIRED_TEXT = `Para consultar tu referencia debes iniciar sesión. ${ASK_DOCUMENTO_TEXT}`;
export const REFERENCIA_NONE_TEXT = "No cuentas con referencias registradas.";
export const REFERENCIA_LOOKUP_FAILED_TEXT = "No pudimos consultar tus referencias en este momento. Inténtalo de nuevo más tarde.";
export const REFERENCIA_CITA_OFFER_QUESTION_TEXT = "¿Deseas agendar una cita?";
export const REFERENCIA_GOODBYE_TEXT =
  "Entendido. Cuando necesites consultar una referencia o agendar una cita, escríbenos. ¡Que tengas un buen día!";

export const REFERENCIA_CITA_OFFER_BUTTONS = [
  { id: ReferenciaCitaOfferButtonId.YES, title: SI_BUTTON_TEXT },
  { id: ReferenciaCitaOfferButtonId.NO, title: NO_BUTTON_TEXT },
];

export const REFERENCIA_CHOICE_QUESTION_TEXT =
  "Gestión de Referencias Médicas:\n\nPara una cita en hospital o instituto, tu centro de origen debe emitir la Hoja de Referencia (REFCON).\n\n¿Qué deseas hacer?";
export const CONSULTAR_REFERENCIA_BUTTON_TEXT = "Consultar referencia";
export const AGENDAR_CITA_BUTTON_TEXT = "Agendar cita";

export const REFERENCIA_CHOICE_BUTTONS = [
  { id: ReferenciaChoiceButtonId.CONSULTAR_REFERENCIA, title: CONSULTAR_REFERENCIA_BUTTON_TEXT },
  { id: ReferenciaChoiceButtonId.AGENDAR_CITA, title: AGENDAR_CITA_BUTTON_TEXT },
];

export const REFERENCIAS_LIST_TEXT = "Aquí tienes todas tus referencias. Las que te permiten agendar una cita aparecen primero.";
export const REFERENCIAS_CITA_LIST_TEXT = "Elige la referencia con la que deseas agendar tu cita:";

export const REFERENCIA_ELECCION_QUESTION_TEXT = "Detectamos que tienes referencias médicas. ¿Cómo deseas agendar tu cita?";
export const CON_REFERENCIA_BUTTON_TEXT = "Con referencia";
export const SIN_REFERENCIA_BUTTON_TEXT = "Sin referencia";

export const REFERENCIA_ELECCION_BUTTONS = [
  { id: ReferenciaEleccionButtonId.CON, title: CON_REFERENCIA_BUTTON_TEXT },
  { id: ReferenciaEleccionButtonId.SIN, title: SIN_REFERENCIA_BUTTON_TEXT },
];

export const REFERENCIA_SIN_CUPOS_QUESTION_TEXT =
  "Esta referencia no tiene programación de atención disponible por ahora. ¿Qué deseas hacer?";
export const VER_OTRA_REFERENCIA_BUTTON_TEXT = "Ver otra referencia";
export const CITA_SIN_REFERENCIA_BUTTON_TEXT = "Cita sin referencia";

export const REFERENCIA_SIN_CUPOS_BUTTONS = [
  { id: ReferenciaSinCuposButtonId.VER_OTRA, title: VER_OTRA_REFERENCIA_BUTTON_TEXT },
  { id: ReferenciaSinCuposButtonId.SIN_REFERENCIA, title: CITA_SIN_REFERENCIA_BUTTON_TEXT },
];

export const REFERENCIA_ETIQUETA_SIN_PROGRAMACION = "Sin programación";
export const REFERENCIA_SIN_PROGRAMACION_TEXT = "Esta referencia no tiene programación de atención. Elige otra.";
export const REFERENCIA_SIN_OTRAS_TEXT = "No tienes otras referencias con programación disponible. Continuemos con tu cita sin referencia.";

export const REFERENCIA_ETIQUETA_ACEPTADO = "Aceptado";
export const REFERENCIA_ETIQUETA_PACIENTE_RECIBIDO = "Paciente recibido";
export const REFERENCIA_ETIQUETA_PACIENTE_CITADO = "Paciente citado";

export const referenciaEstadoSinDescripcionText = (codigo: number): string => `Código ${codigo}`;

export type ReferenciaDerivacion = {
  origen: string;
  upsOrigen: string;
  destino: string;
};

const derivacionText = ({ origen, upsOrigen, destino }: ReferenciaDerivacion): string =>
  upsOrigen ? `${origen} te derivó por ${upsOrigen} a ${destino}.` : `${origen} te derivó a ${destino}.`;

export const referenciaAceptadaText = (derivacion: ReferenciaDerivacion): string =>
  `${derivacionText(derivacion)} Tu referencia fue aceptada; puedes agendar tu cita.`;

export const referenciaRecibidaText = (derivacion: ReferenciaDerivacion): string =>
  `${derivacionText(derivacion)} Tu referencia está vigente; puedes agendar tu cita.`;

export const referenciaCitadaText = (derivacion: ReferenciaDerivacion): string =>
  `${derivacionText(derivacion)} Tu referencia está vigente; puedes agendar una nueva cita.`;

export const referenciaNoAgendableText = (derivacion: ReferenciaDerivacion, estado: string): string =>
  `${derivacionText(derivacion)} Por su estado (${estado}), esta referencia no permite agendar una cita.`;

export const referenciaBloqueadaText = (estado: string): string =>
  `Esta referencia está en estado ${estado} y no permite agendar una cita. Elige otra.`;

export const referenciaResumenText = (etiqueta: string, numero: string, fecha: string): string =>
  [etiqueta, numero ? `N° ${numero}` : "", fecha].filter(Boolean).join(" · ");

export type ReferenciaDetalle = {
  numero: string;
  fecha: string;
  origen: string;
  upsOrigen: string;
  destino: string;
  upsDestino: string;
  estado: string;
  mensaje: string;
};

const conUps = (nombre: string, ups: string): string => (ups ? `${nombre} (${ups})` : nombre);

export const referenciaDetalleText = (referencia: ReferenciaDetalle): string => `N° : ${referencia.numero}
Fecha: ${referencia.fecha}
Origen: ${conUps(referencia.origen, referencia.upsOrigen)}
Destino: ${conUps(referencia.destino, referencia.upsDestino)}
Estado: ${referencia.estado}

${referencia.mensaje}`;
