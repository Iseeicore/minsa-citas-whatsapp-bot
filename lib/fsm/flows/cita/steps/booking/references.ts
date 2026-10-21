import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import {
  buildResult,
  cloneSession,
  offerPagedList,
  query,
  sendButtons,
  sendText,
  readTappedId,
  withLeadingText,
} from "@/lib/fsm/core/handlers-shared";
import { clearOffered, resolveSelection } from "@/lib/fsm/flows/cita/parsing/selection";
import { continueCitaAfterVerification } from "@/lib/fsm/flows/cita/steps/identity/identity";
import { presentarReferencia, referenciaRows } from "@/lib/fsm/flows/referencia/presentacion";
import { rechazarReferenciaBloqueada, referenciaBloqueadaAviso } from "@/lib/fsm/flows/referencia/bloqueo";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { ReferenciaConfirmButtonId } from "@/lib/enums/referencia-confirm-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { QueryKind } from "@/lib/enums/query-kind";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import {
  REFERENCIA_CONFIRM_QUESTION_TEXT,
  searchingFechasForReferenciaText,
  REFERENCIA_CONFIRM_BUTTONS,
} from "@/lib/constants/textos/cita-reserva";
import { REFERENCIAS_CITA_LIST_TEXT, REFERENCIAS_LIST_TEXT, referenciaDetalleText } from "@/lib/constants/textos/referencia";
import { REFERENCIAS_PAGE_SIZE } from "@/lib/constants/limits/referencia";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { isString } from "@/lib/utils/type-guards";
import { parseJsonOr } from "@/lib/utils/safe-json";
import { arrayOr } from "@/lib/utils/array-values";

export function readReferencias(session: Session): ReferenciaItem[] {
  const raw = session.slots[SlotKey.CITA_REFERENCIAS_DATA];
  if (!isString(raw)) return [];
  return arrayOr<ReferenciaItem>(parseJsonOr(raw, []));
}

export function readReferenciasSinCupos(slots: Session["slots"]): string[] {
  const raw = slots[SlotKey.CITA_REFERENCIAS_SIN_CUPOS];
  if (!isString(raw)) return [];
  return arrayOr<unknown>(parseJsonOr(raw, [])).filter(isString);
}

const esCaminoCita = (session: Session): boolean => session.slots[SlotKey.POST_LOGIN_FLOW] === PostLoginFlow.CITA;

export function offerReferenciasList(session: Session): HandlerResult {
  const next = cloneSession(session);
  delete next.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID];
  next.state = SessionState.CITA_AWAITING_REFERENCIA_SELECT;
  const cita = esCaminoCita(next);
  const rows = referenciaRows(readReferencias(next), { soloAgendables: cita, sinProgramacion: readReferenciasSinCupos(next.slots) });
  return buildResult(next, offerPagedList(next, cita ? REFERENCIAS_CITA_LIST_TEXT : REFERENCIAS_LIST_TEXT, rows, REFERENCIAS_PAGE_SIZE));
}

function continueWithReferencia(session: Session, item: ReferenciaItem | undefined): HandlerResult {
  const aviso = referenciaBloqueadaAviso(item, readReferenciasSinCupos(session.slots));
  if (aviso) return withLeadingText(offerReferenciasList(session), aviso);

  const next = cloneSession(session);
  if (!esCaminoCita(next)) delete next.slots[SlotKey.POST_LOGIN_FLOW];

  if (!item?.codigoIpressDestino || !item.codigoUpsDestino) {
    delete next.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID];
    delete next.slots[SlotKey.POST_LOGIN_FLOW];
    return continueCitaAfterVerification(next);
  }

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
  const confirmation = sendButtons(REFERENCIA_CONFIRM_QUESTION_TEXT, REFERENCIA_CONFIRM_BUTTONS);
  if (!item) return buildResult(session, [confirmation]);
  return buildResult(session, [sendText(referenciaDetalleText(presentarReferencia(item).detalle)), confirmation]);
}

export function handleAwaitingReferenciaSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event);
  if ("result" in outcome) return outcome.result;

  const item = readReferencias(session).find((r) => r.idReferencia === outcome.replyId);
  const blocked = rechazarReferenciaBloqueada(session, item, readReferenciasSinCupos(session.slots));
  if (blocked) return blocked;

  const next = clearOffered(session);
  next.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID] = outcome.replyId;
  next.state = SessionState.CITA_AWAITING_REFERENCIA_CONFIRM;
  return askReferenciaConfirmation(next, item);
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
