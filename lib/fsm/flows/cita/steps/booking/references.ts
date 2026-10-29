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
  readTypedText,
  isConsultaReferenciasList,
  NOT_HANDLED,
  withLeadingText,
} from "@/lib/fsm/core/handlers-shared";
import { closeReferencia } from "@/lib/fsm/flows/referencia/close-reference";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { CONSULTA_REFERENCIAS_ACTION_ANSWERS } from "@/lib/constants/palabras-clave";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";
import { SendType } from "@/lib/enums/send-type";
import { clearOffered, reshowOffered, resolveSelection } from "@/lib/fsm/flows/cita/parsing/selection";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import { readReferencias, readReferenciasSinProgramacion } from "@/lib/fsm/flows/cita/steps/booking/referencia-seleccionada";
import {
  esReferenciaSeleccionable,
  etiquetasSeleccionables,
  referenciaBloqueadaAviso,
  referenciaEspecialidad,
  referenciaEstadoEtiqueta,
  referenciasBloqueadasAviso,
  tieneReferenciasSeleccionables,
} from "@/lib/fsm/flows/cita/steps/booking/referencia-estado";
import { startReferenciasLookup } from "@/lib/fsm/flows/referencia/lookup";
import { startNewAppointment } from "@/lib/fsm/flows/referencia/new-appointment";
import { referenceRowDescription } from "@/lib/utils/reference-row-description";
import { CONSULTA_REFERENCIAS_ACTIONS, consultaReferenciasListText } from "@/lib/constants/textos/cita-referencia";
import type { HandleEvent, HandlerAttempt, HandlerResult, InboundEvent, ListRow, Session, UnhandledTurn } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { ReferenciaConfirmButtonId } from "@/lib/enums/referencia-confirm-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { CounterKey } from "@/lib/enums/counter-key";
import { QueryKind } from "@/lib/enums/query-kind";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { SessionChannel } from "@/lib/enums/session-channel";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import {
  REFERENCIA_CONFIRM_QUESTION_TEXT,
  referenciaDetalleText,
  REFERENCIA_CONFIRM_BUTTONS,
  REFERENCIA_INCOMPLETA_TEXT,
  REFERENCIA_NO_DISPONIBLE_TEXT,
} from "@/lib/constants/textos/cita-reserva";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { REFERENCIA_CITA_OFFER_BUTTONS, REFERENCIA_CITA_OFFER_QUESTION_TEXT } from "@/lib/constants/textos/referencia";
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
  next.slots[SlotKey.POST_LOGIN_FLOW] = PostLoginFlow.REFERENCIAS;
  return readReferencias(next).length > 0 ? offerSelectableReferencias(next) : startReferenciasLookup(next);
}

function formatFechaHora12(fechaHora: string): string {
  const [fecha, hora] = fechaHora.split(" ");
  if (!fecha || !hora || !CLOCK_TIME.test(hora)) return fechaHora;
  return `${fecha} ${formatHora12(hora)}`;
}

function referenciaRows(items: ReferenciaItem[], web: boolean, sinProgramacion: ReadonlySet<string>): ListRow[] {
  return items.map((item) => {
    const especialidad = referenciaEspecialidad(item);
    const fecha = item.fechaInicio.split(" ")[0];
    const estado = referenciaEstadoEtiqueta(item, sinProgramacion);
    return {
      id: item.idReferencia,
      title: truncateForRow(especialidad, WHATSAPP_ROW_TITLE_MAX),
      description: referenceRowDescription(
        { destino: item.ipressDestino, numero: item.numero, fecha, estado },
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
  const web = channelOf(next) === SessionChannel.WEB;
  const sinProgramacion = readReferenciasSinProgramacion(next);
  const text = consultaReferenciasListText(etiquetasSeleccionables());
  const items = readReferencias(next).filter((item) => esReferenciaSeleccionable(item, sinProgramacion));
  return buildResult(next, offerPagedList(next, text, referenciaRows(items, web, sinProgramacion)));
}

export function withConsultaReferenciasActions(result: HandlerResult): HandlerResult {
  if (result.session.state !== SessionState.CITA_AWAITING_REFERENCIA_SELECT) return result;
  const effects = result.effects.map((effect) =>
    effect.kind === SendType.INTERACTIVE_LIST
      ? { ...effect, actions: [...(effect.actions ?? []), ...CONSULTA_REFERENCIAS_ACTIONS] }
      : effect,
  );
  return { ...result, effects };
}

const CONSULTA_ACTION_HANDLERS = new Map<string, (session: Session) => HandlerResult>([
  [ReferenciaActionButtonId.NEW_APPOINTMENT, startNewAppointment],
  [ReferenciaActionButtonId.EXIT, closeReferencia],
]);

function findConsultaAction(event: InboundEvent): ((session: Session) => HandlerResult) | UnhandledTurn {
  const answer = readTappedId(event) ?? CONSULTA_REFERENCIAS_ACTION_ANSWERS.get(normalizeText(readTypedText(event)));
  return answer ? CONSULTA_ACTION_HANDLERS.get(answer) : NOT_HANDLED;
}

export function handleConsultaReferenciasClose(session: Session, event: HandleEvent): HandlerAttempt {
  if (event.type !== InboundEventType.TEXT || !isConsultaReferenciasList(session)) return NOT_HANDLED;
  return CONSULTA_REFERENCIAS_ACTION_ANSWERS.get(normalizeText(readTypedText(event))) === ReferenciaActionButtonId.EXIT
    ? closeReferencia()
    : NOT_HANDLED;
}

function askConsultaCitaOffer(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.REFERENCIA_AWAITING_CITA_OFFER;
  const question = buildResult(next, [sendButtons(REFERENCIA_CITA_OFFER_QUESTION_TEXT, REFERENCIA_CITA_OFFER_BUTTONS)]);
  const aviso = referenciasBloqueadasAviso(readReferencias(next), readReferenciasSinProgramacion(next));
  return aviso ? withLeadingText(question, aviso) : question;
}

export function offerSelectableReferencias(session: Session): HandlerResult {
  if (tieneReferenciasSeleccionables(readReferencias(session), readReferenciasSinProgramacion(session)))
    return offerReferenciasList(session);
  return askConsultaCitaOffer(session);
}

export function offerConsultaReferencias(session: Session): HandlerResult {
  const aviso = referenciasBloqueadasAviso(readReferencias(session), readReferenciasSinProgramacion(session));
  const result = offerReferenciasList(session);
  return aviso ? withLeadingText(result, aviso) : result;
}

function recoverInvalidReferencia(session: Session, message: string): HandlerResult {
  return withLeadingText(restartReferenceSelection(session), message);
}

function rejectBlockedReferencia(session: Session, item: ReferenciaItem): HandlerResult {
  const notice = referenciaBloqueadaAviso(item, readReferenciasSinProgramacion(session));
  const offered = session.state === SessionState.CITA_AWAITING_REFERENCIA_SELECT ? readOffered(session.slots) : undefined;
  return offered ? reshowOffered(session, offered, notice) : withLeadingText(offerSelectableReferencias(session), notice);
}

function continueWithReferencia(session: Session, item: ReferenciaItem | undefined): HandlerResult {
  if (item && !esReferenciaSeleccionable(item, readReferenciasSinProgramacion(session))) return rejectBlockedReferencia(session, item);
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
  return buildResult(next, [query(QueryKind.LIST_FECHAS, { codEess: item.codigoIpressDestino, especialidadId: item.codigoUpsDestino })]);
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
    estado: referenciaEstadoEtiqueta(item, readReferenciasSinProgramacion(session)),
  });
  return buildResult(session, [sendText(detalle), sendButtons(REFERENCIA_CONFIRM_QUESTION_TEXT, REFERENCIA_CONFIRM_BUTTONS)]);
}

export function handleAwaitingReferenciaSelect(session: Session, event: InboundEvent): HandlerResult {
  const action = findConsultaAction(event);
  if (action) return action(session);
  const outcome = resolveSelection(session, event, { includeDescription: channelOf(session) === SessionChannel.WEB });
  if ("result" in outcome) return outcome.result;

  const item = readReferencias(session).find((r) => r.idReferencia === outcome.replyId);
  if (item && !esReferenciaSeleccionable(item, readReferenciasSinProgramacion(session))) return rejectBlockedReferencia(session, item);
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
