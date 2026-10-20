import { DuplicateButtonId } from "@/lib/enums/duplicate-button-id";
import { NO_SALIR_BUTTON_TEXT, SI_BUTTON_TEXT } from "@/lib/constants/textos/comunes";
import { ReferenciaConfirmButtonId } from "@/lib/enums/referencia-confirm-button-id";

export const APPOINTMENT_DETAILS_TEXT =
  "Ingrese a la plataforma oficial para visualizar los detalles de su atención (establecimiento, fecha, hora y consultorio):";
export const APPOINTMENT_BUTTON_TEXT = "Ver mi cita";
export const BOOKING_DEFAULT_MESSAGE_TEXT = "Cita creada correctamente";

export const constanciaCitaText = (detalle: string): string => `*MINISTERIO DE SALUD DEL PERÚ*
*Constancia de Registro de Cita*

Estimado(a) usuario(a), su solicitud ha sido procesada con éxito:
${detalle}

Nota: Recuerde acudir a su cita portando su DNI o documento de identidad físico.`;

export const BOOKING_TECHNICAL_RETRY_TEXT =
  "Tuvimos un problema técnico al intentar reservar tu cita. Vamos a intentarlo de nuevo — estos son los horarios disponibles de la misma fecha:";
export const BOOKING_SLOT_TAKEN_RETRY_TEXT =
  "No pudimos reservar ese horario, puede que otra persona lo haya tomado justo antes. Te muestro los horarios disponibles de la misma fecha:";
export const BOOKING_REJECTED_TEXT = "No pudimos agendar tu cita. Intenta de nuevo más tarde.";
export const BOOKING_IN_PROGRESS_TEXT = "Agendando tu cita…";
export const DUPLICATE_QUESTION_TEXT = "El MINSA permite una sola cita activa por especialidad. ¿Deseas intentar con otra especialidad?";
export const duplicateActiveText = (especialidad: string): string =>
  `Ya tienes una cita activa para ${especialidad}. ${DUPLICATE_QUESTION_TEXT}`;
export const DUPLICATE_YES_BUTTON_TEXT = "Otra especialidad";
export const SEARCHING_OTHER_ESPECIALIDADES_TEXT = "Buscando otras especialidades disponibles…";

export const REFERENCIA_ESTADO_LABELS: Record<number, string> = {
  3: "ACEPTADO",
  5: "PACIENTE RECIBIDO",
  7: "PACIENTE CITADO",
};

export const REFERENCIAS_LIST_TEXT = "Estas son tus referencias:";
export const searchingFechasForReferenciaText = (destino: string): string =>
  `Perfecto. Buscando fechas disponibles para tu referencia en *${destino}*…`;
export const REFERENCIA_CONFIRM_QUESTION_TEXT = "¿Es esta tu referencia?";

export type ReferenciaDetalle = {
  numero: string;
  fecha: string;
  origen: string;
  upsOrigen: string;
  destino: string;
  upsDestino: string;
  estado: string;
};

export const referenciaDetalleText = (referencia: ReferenciaDetalle): string => `N° : ${referencia.numero}
Fecha: ${referencia.fecha}
Origen: ${referencia.origen} (${referencia.upsOrigen})
Destino: ${referencia.destino} (${referencia.upsDestino})
Estado: ${referencia.estado}

${REFERENCIA_CONFIRM_QUESTION_TEXT}`;

export const REFERENCIA_CONFIRM_NO_BUTTON_TEXT = "No, ver otra";

export const DUPLICATE_BUTTONS = [
  { id: DuplicateButtonId.OTHER_ESPECIALIDAD, title: DUPLICATE_YES_BUTTON_TEXT },
  { id: DuplicateButtonId.EXIT, title: NO_SALIR_BUTTON_TEXT },
];

export const REFERENCIA_CONFIRM_BUTTONS = [
  { id: ReferenciaConfirmButtonId.YES, title: SI_BUTTON_TEXT },
  { id: ReferenciaConfirmButtonId.NO, title: REFERENCIA_CONFIRM_NO_BUTTON_TEXT },
];
