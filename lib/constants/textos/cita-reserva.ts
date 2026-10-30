import { DuplicateButtonId } from "@/lib/enums/duplicate-button-id";
import { NO_SALIR_BUTTON_TEXT, SI_BUTTON_TEXT } from "@/lib/constants/textos/comunes";
import { ReferenciaConfirmButtonId } from "@/lib/enums/referencia-confirm-button-id";
import { ReferenciaEstadoCodigo } from "@/lib/enums/referencia-estado-codigo";

export const APPOINTMENT_BUTTON_TEXT = "Ver mi cita";
export const APPOINTMENT_CTA_TEXT = `Si desea ver el PDF de su cita, dé clic en *${APPOINTMENT_BUTTON_TEXT}*.

Gracias por comunicarte con el *Ministerio de Salud del Perú*. Si necesitas agendar otra cita, escríbenos nuevamente. ¡Que tengas un buen día! 👋`;
export const BOOKING_DEFAULT_MESSAGE_TEXT = "Cita creada correctamente";

export const constanciaCitaText = (detalle: string): string => `*MINISTERIO DE SALUD DEL PERÚ*
*Constancia de Registro de Cita*

Estimado(a) usuario(a), su solicitud ha sido procesada con éxito:
*${detalle}*

*Nota:* Recuerde acudir a su cita portando su DNI o documento de identidad físico e intente llegar 15 minutos antes.`;

export const BOOKING_TECHNICAL_RETRY_TEXT =
  "Tuvimos un problema técnico al intentar reservar tu cita. Vamos a intentarlo de nuevo — estos son los horarios disponibles de la misma fecha:";
export const BOOKING_SLOT_TAKEN_RETRY_TEXT =
  "No pudimos reservar ese horario, puede que otra persona lo haya tomado justo antes. Te muestro los horarios disponibles de la misma fecha:";
export const BOOKING_SERVICE_UNAVAILABLE_TEXT = "En este momento el servicio tiene problemas. Por favor, inténtalo más tarde.";
export const BOOKING_REJECTED_TEXT = "No pudimos agendar tu cita. Intenta de nuevo más tarde.";
export const DUPLICATE_QUESTION_TEXT = "El MINSA permite una sola cita activa por especialidad. ¿Deseas intentar con otra especialidad?";
export const duplicateActiveText = (especialidad: string): string =>
  `Ya tienes una cita activa para ${especialidad}. ${DUPLICATE_QUESTION_TEXT}`;
export const DUPLICATE_YES_BUTTON_TEXT = "Otra especialidad";

export const REFERENCIA_ESTADO_LABELS: Partial<Record<number, string>> = {
  [ReferenciaEstadoCodigo.ACEPTADO]: "ACEPTADO",
  [ReferenciaEstadoCodigo.PACIENTE_RECIBIDO]: "PACIENTE RECIBIDO",
  [ReferenciaEstadoCodigo.PACIENTE_CITADO]: "PACIENTE CITADO",
};
export const referenciaEstadoCodigoText = (codigo: number): string => `Código ${codigo}`;
export const REFERENCIA_SIN_PROGRAMACION_ETIQUETA = "Sin programación";
export const REFERENCIA_SIN_PROGRAMACION_TEXT = "Esta referencia no tiene programación de atención disponible. Elige otra.";
export const referenciaBloqueadaText = (etiqueta: string): string =>
  `Esta referencia está en estado ${etiqueta} y no permite agendar una cita. Elige otra.`;

export const REFERENCIA_ESPECIALIDAD_LABEL = "Especialidad / atención";
export const REFERENCIA_DESTINO_LABEL = "Destino";
export const REFERENCIA_ORIGEN_LABEL = "Origen";
export const REFERENCIA_FECHA_LABEL = "Fecha de referencia";
export const REFERENCIA_ESPECIALIDAD_NO_INFORMADA_TEXT = "Especialidad no informada";
export const referenciaNumeroText = (numero: string): string => `Referencia N.° ${numero}`;
export const referenciaSeleccionText = (especialidad: string, numero: string): string =>
  `${especialidad} · ${referenciaNumeroText(numero)}`;
export const REFERENCIA_INCOMPLETA_TEXT =
  "No podemos agendar con esta referencia porque no tiene todos los datos de destino. Puedes elegir otra referencia o continuar con una nueva cita.";
export const REFERENCIA_NO_DISPONIBLE_TEXT =
  "La referencia seleccionada ya no está en el listado de esta conversación. Vuelve a elegir cómo deseas agendar tu cita.";
export const REFERENCIA_SIN_FECHAS_TEXT = "No encontramos cupos disponibles para esta referencia. ¿Deseas seleccionar otra referencia?";
export const REFERENCIA_DUPLICATE_TEXT =
  "MINSA informa que ya tienes una cita activa para esta especialidad. Continuemos con una cita sin referencia.";
export const referenciaListDescriptionText = (destino: string, numero: string, fecha: string, estado: string): string =>
  `${destino} · N° ${numero} · ${fecha} · ${estado}`;
export const referenciaReservaResumenText = (
  numero: string,
  especialidad: string,
  destino: string,
  fecha: string,
  horario: string,
): string => `Revisa los datos de tu cita con referencia antes de confirmar:
Referencia: ${numero}
Especialidad: ${especialidad}
Establecimiento: ${destino}
Fecha: ${fecha}
Horario: ${horario}`;
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
