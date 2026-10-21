import { CLOCK_TIME } from "@/lib/constants/regex/text";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { formatHora12 } from "@/lib/fsm/flows/cita/steps/hora/format";
import { channelOf } from "@/lib/fsm/core/channel";
import {
  buildResult,
  cloneSession,
  offerPagedList,
  query,
  sendButtons,
  sendText,
  truncateForRow,
  readTappedId,
  withLeadingText,
} from "@/lib/fsm/core/handlers-shared";
import { clearOffered, resolveSelection } from "@/lib/fsm/flows/cita/parsing/selection";
import { readReferencias } from "@/lib/fsm/flows/cita/steps/booking/referencia-seleccionada";
import { askAppointmentMode, askReferenceLookupRetry } from "@/lib/fsm/flows/referencia/appointment-mode-prompts";
import type { HandlerResult, InboundEvent, ListRow, Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { ReferenciaConfirmButtonId } from "@/lib/enums/referencia-confirm-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { CounterKey } from "@/lib/enums/counter-key";
import { QueryKind } from "@/lib/enums/query-kind";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { SessionChannel } from "@/lib/enums/session-channel";
import { AppointmentMode } from "@/lib/enums/appointment-mode";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import {
  REFERENCIA_ESTADO_LABELS,
  REFERENCIAS_LIST_TEXT,
  REFERENCIA_CONFIRM_QUESTION_TEXT,
  searchingFechasForReferenciaText,
  referenciaDetalleText,
  REFERENCIA_CONFIRM_BUTTONS,
  REFERENCIA_INCOMPLETA_TEXT,
  REFERENCIA_NO_DISPONIBLE_TEXT,
  REFERENCIA_ESPECIALIDAD_NO_INFORMADA_TEXT,
  referenciaListDescriptionText,
} from "@/lib/constants/textos/cita-reserva";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { WHATSAPP_ROW_TITLE_MAX, WHATSAPP_ROW_DESCRIPTION_MAX } from "@/lib/constants/limits/whatsapp";

const REFERENCE_APPOINTMENT_CLEANUP_SLOTS = [
  SlotKey.INITIAL_MESSAGE_TEXT,
  SlotKey.CITA_DISTRITO_HINT_TEXT,
  SlotKey.CITA_ESPECIALIDAD_HINT_TEXT,
  SlotKey.CITA_ESTABLECIMIENTO_HINT_TEXT,
  SlotKey.CITA_DISTRITO,
  SlotKey.CITA_DEPARTAMENTO,
  SlotKey.CITA_PROVINCIA,
  SlotKey.CITA_UBIGEO,
  SlotKey.CITA_FECHA,
  SlotKey.CITA_FECHAS_DESCARTADAS,
  SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS,
  SlotKey.CITA_ESPECIALIDADES_DESCARTADAS,
  SlotKey.CITA_ESTABLECIMIENTO_SIN_FECHAS,
  SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO,
  SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE,
  SlotKey.CITA_HORAS_DIA,
  SlotKey.CITA_HORA_CONFIRM_ID,
  SlotKey.CITA_HORA_CONFIRM_ONLY,
  SlotKey.CITA_HORA_CHOICE_A,
  SlotKey.CITA_HORA_CHOICE_B,
  SlotKey.CITA_COD_EESS,
  SlotKey.CITA_ESPECIALIDAD_ID,
  SlotKey.CITA_ESTABLECIMIENTO_NOMBRE,
  SlotKey.CITA_ESPECIALIDAD_NOMBRE,
  SlotKey.CITA_REFERENCIA_SELECCIONADA_ID,
  SlotKey.CITA_RESUME_STATE,
  SlotKey.CITA_EXIT_RESUME_STATE,
  SlotKey.CITA_SELECTION_STEP,
];

const REFERENCE_APPOINTMENT_CLEANUP_COUNTERS = [
  CounterKey.CITA_BOOKING_FAILURES,
  CounterKey.CITA_HORA_PAGE,
  CounterKey.CITA_LIST_PAGE,
  CounterKey.CITA_ESTABLECIMIENTOS_PAGE,
  CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES,
];

function clearReferenceAppointment(session: Session): Session {
  const next = clearOffered(session);
  for (const slot of REFERENCE_APPOINTMENT_CLEANUP_SLOTS) delete next.slots[slot];
  for (const counter of REFERENCE_APPOINTMENT_CLEANUP_COUNTERS) delete next.counters[counter];
  return next;
}

export function restartReferenceSelection(session: Session): HandlerResult {
  const next = clearReferenceAppointment(session);
  next.slots[SlotKey.CITA_APPOINTMENT_MODE] = AppointmentMode.REFERENCE;
  next.slots[SlotKey.POST_LOGIN_FLOW] = PostLoginFlow.CITA_REFERENCIAS;
  return readReferencias(next).length > 0 ? offerReferenciasList(next) : askReferenceLookupRetry(next);
}

function formatFechaHora12(fechaHora: string): string {
  const [fecha, hora] = fechaHora.split(" ");
  if (!fecha || !hora || !CLOCK_TIME.test(hora)) return fechaHora;
  return `${fecha} ${formatHora12(hora)}`;
}

function referenciaRows(items: ReferenciaItem[], web: boolean): ListRow[] {
  return items.map((item) => {
    const especialidad = item.upsDestino.trim() ? item.upsDestino : REFERENCIA_ESPECIALIDAD_NO_INFORMADA_TEXT;
    const fecha = item.fechaInicio.split(" ")[0];
    const estado = REFERENCIA_ESTADO_LABELS[item.estado] ?? "";
    return {
      id: item.idReferencia,
      title: truncateForRow(especialidad, WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(
        referenciaListDescriptionText(item.ipressDestino, item.numero, fecha, estado),
        WHATSAPP_ROW_DESCRIPTION_MAX,
      ),
      ...(web
        ? {
            referencia: { especialidad, numero: item.numero, destino: item.ipressDestino, origen: item.ipressOrigen, fecha, estado },
          }
        : {}),
    };
  });
}

export function offerReferenciasList(session: Session): HandlerResult {
  const next = cloneSession(session);
  delete next.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID];
  next.state = SessionState.CITA_AWAITING_REFERENCIA_SELECT;
  return buildResult(
    next,
    offerPagedList(next, REFERENCIAS_LIST_TEXT, referenciaRows(readReferencias(next), channelOf(next) === SessionChannel.WEB)),
  );
}

function recoverInvalidReferencia(session: Session, message: string): HandlerResult {
  const next = clearOffered(session);
  delete next.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID];
  const retry = readReferencias(next).length > 0 ? askAppointmentMode(next) : askReferenceLookupRetry(next);
  return withLeadingText(retry, message);
}

function continueWithReferencia(session: Session, item: ReferenciaItem | undefined): HandlerResult {
  if (!item?.codigoIpressDestino || !item.codigoUpsDestino) {
    return recoverInvalidReferencia(session, item ? REFERENCIA_INCOMPLETA_TEXT : REFERENCIA_NO_DISPONIBLE_TEXT);
  }

  const next = clearReferenceAppointment(session);
  delete next.slots[SlotKey.POST_LOGIN_FLOW];
  next.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID] = item.idReferencia;
  next.slots[SlotKey.CITA_COD_EESS] = item.codigoIpressDestino;
  next.slots[SlotKey.CITA_ESPECIALIDAD_ID] = item.codigoUpsDestino;
  next.slots[SlotKey.CITA_ESTABLECIMIENTO_NOMBRE] = item.ipressDestino;
  if (item.upsDestino) next.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE] = item.upsDestino;
  next.state = SessionState.CITA_FECHA_PENDING;
  return buildResult(next, [
    sendText(searchingFechasForReferenciaText(item.ipressDestino)),
    query(QueryKind.LIST_FECHAS, { codEess: item.codigoIpressDestino, especialidadId: item.codigoUpsDestino }),
  ]);
}

function askReferenciaConfirmation(session: Session, item: ReferenciaItem | undefined): HandlerResult {
  if (!item) return recoverInvalidReferencia(session, REFERENCIA_NO_DISPONIBLE_TEXT);
  const detalle = referenciaDetalleText({
    numero: item?.numero ?? "",
    fecha: formatFechaHora12(item?.fechaInicio ?? ""),
    origen: item?.ipressOrigen ?? "",
    upsOrigen: item?.upsOrigen ?? "",
    destino: item?.ipressDestino ?? "",
    upsDestino: item?.upsDestino ?? "",
    estado: REFERENCIA_ESTADO_LABELS[item?.estado ?? 0] ?? "",
  });
  return buildResult(session, [sendText(detalle), sendButtons(REFERENCIA_CONFIRM_QUESTION_TEXT, REFERENCIA_CONFIRM_BUTTONS)]);
}

export function handleAwaitingReferenciaSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, { includeDescription: channelOf(session) === SessionChannel.WEB });
  if ("result" in outcome) return outcome.result;

  const item = readReferencias(session).find((r) => r.idReferencia === outcome.replyId);
  const next = clearOffered(session);
  next.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID] = outcome.replyId;
  return continueWithReferencia(next, item);
}

export function reshowReferenciaConfirmation(session: Session): HandlerResult {
  const selectedId = slotText(session.slots, SlotKey.CITA_REFERENCIA_SELECCIONADA_ID);
  return askReferenciaConfirmation(
    session,
    readReferencias(session).find((r) => r.idReferencia === selectedId),
  );
}

export function handleAwaitingReferenciaConfirm(session: Session, event: InboundEvent): HandlerResult {
  const reply = readTappedId(event);
  const typed = event.type === InboundEventType.TEXT ? resolveConfirmation(event.text ?? "") : Confirmation.UNKNOWN;

  if (reply === ReferenciaConfirmButtonId.NO || typed === Confirmation.NO) {
    return offerReferenciasList(session);
  }

  const selectedId = slotText(session.slots, SlotKey.CITA_REFERENCIA_SELECCIONADA_ID);
  const item = readReferencias(session).find((r) => r.idReferencia === selectedId);

  if (reply === ReferenciaConfirmButtonId.YES || typed === Confirmation.YES) {
    return continueWithReferencia(session, item);
  }

  return askReferenciaConfirmation(session, item);
}
