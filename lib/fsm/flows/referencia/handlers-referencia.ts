import {
  buildResult,
  cloneSession,
  omitSlot,
  readTappedId,
  sendButtons,
  sendText,
  withLeadingText,
  withNote,
  withRejectionNotice,
} from "@/lib/fsm/core/handlers-shared";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { continueCitaAfterVerification } from "@/lib/fsm/flows/cita/steps/identity/continuation";
import { offerReferenciasList } from "@/lib/fsm/flows/cita/steps/booking/references";
import { tieneReferenciasSeleccionables } from "@/lib/fsm/flows/cita/steps/booking/referencia-estado";
import { handleOtherReference } from "@/lib/fsm/flows/referencia/other-reference";
import { closeReferencia } from "@/lib/fsm/flows/referencia/close-reference";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/identity/reverification";
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import type { ListReferencesResult } from "@/lib/integrations/minsa/types";
import {
  REFERENCIA_CITA_OFFER_BUTTONS,
  REFERENCIA_CITA_OFFER_QUESTION_TEXT,
  REFERENCIA_CONSULTA_FALLIDA_TEXT,
  REFERENCIA_LOGIN_REQUIRED_TEXT,
  REFERENCIA_NONE_TEXT,
  REFERENCIA_SIN_AGENDABLES_TEXT,
} from "@/lib/constants/textos/referencia";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { ReferenciaCitaOfferButtonId } from "@/lib/enums/referencia-cita-offer-button-id";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { UnknownStateError } from "@/lib/errors/unknown-state-error";
import { InternalEventType } from "@/lib/enums/internal-event-type";

export function beginReferencias(slots: Session["slots"]): HandlerResult {
  const next: Session = {
    state: SessionState.CITA_AWAITING_DNI,
    slots: { ...omitSlot(slots, SlotKey.INITIAL_MESSAGE_TEXT), [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.REFERENCIAS },
    counters: {},
  };
  return buildResult(next, [sendText(REFERENCIA_LOGIN_REQUIRED_TEXT)]);
}

export function askCitaOffer(session: Session): HandlerResult {
  return buildResult(session, [sendButtons(REFERENCIA_CITA_OFFER_QUESTION_TEXT, REFERENCIA_CITA_OFFER_BUTTONS)]);
}

export function handleReferenciaLookupPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as ListReferencesResult;
  const next = cloneSession(session);

  if (result.statusReference === ReferenceStatus.UNAUTHORIZED) {
    return beginReverification(next, SessionState.REFERENCIA_LOOKUP_PENDING);
  }
  if (result.statusReference !== ReferenceStatus.FOUND || result.data.length === 0) {
    next.state = SessionState.REFERENCIA_AWAITING_CITA_OFFER;
    const consultada = result.statusReference === ReferenceStatus.EMPTY || result.statusReference === ReferenceStatus.FOUND;
    const aviso = consultada ? REFERENCIA_NONE_TEXT : REFERENCIA_CONSULTA_FALLIDA_TEXT;
    return withLeadingText(askCitaOffer(next), aviso);
  }
  if (!tieneReferenciasSeleccionables(result.data)) {
    next.state = SessionState.REFERENCIA_AWAITING_CITA_OFFER;
    return withLeadingText(askCitaOffer(next), REFERENCIA_SIN_AGENDABLES_TEXT);
  }
  next.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify(result.data);
  return offerReferenciasList(next);
}

export function handleReferenciaAwaitingCitaOffer(session: Session, event: InboundEvent): HandlerResult {
  const reply = readTappedId(event);
  const typed = event.type === InboundEventType.TEXT ? resolveConfirmation(event.text ?? "") : Confirmation.UNKNOWN;

  if (reply === ReferenciaCitaOfferButtonId.YES || typed === Confirmation.YES) {
    return continueCitaAfterVerification({ ...session, slots: omitSlot(session.slots, SlotKey.POST_LOGIN_FLOW) });
  }

  if (reply === ReferenciaCitaOfferButtonId.NO || typed === Confirmation.NO) {
    return closeReferencia();
  }

  return withRejectionNotice(askCitaOffer(session));
}

type ActiveReferenciaState = Exclude<Extract<Session["state"], `referencia_${string}`>, `${SessionState.REFERENCIA_CLOSED}`>;

const REFERENCIA_HANDLERS: Readonly<Record<ActiveReferenciaState, (session: Session, event: HandleEvent) => HandlerResult>> = {
  [SessionState.REFERENCIA_LOOKUP_PENDING]: (session, event) =>
    event.type === InternalEventType.QUERY_RESULT ? handleReferenciaLookupPending(session, event) : buildResult(session, []),
  [SessionState.REFERENCIA_AWAITING_CITA_OFFER]: (session, event) =>
    event.type !== InternalEventType.QUERY_RESULT ? handleReferenciaAwaitingCitaOffer(session, event) : buildResult(session, []),
  [SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE]: (session, event) =>
    event.type !== InternalEventType.QUERY_RESULT ? handleOtherReference(session, event) : buildResult(session, []),
};

const REFERENCIA_HANDLER_BY_STATE = new Map<string, (session: Session, event: HandleEvent) => HandlerResult>(
  Object.entries(REFERENCIA_HANDLERS),
);

const CURRENT_SESSION_STATES = new Set<string>(Object.values(SessionState));

function restartRetiredReferencia(session: Session): HandlerResult {
  return withNote(beginReferencias({}), { kind: "retired_state", level: "warn", detail: { state: session.state } });
}

export function handleReferencia(session: Session, event: HandleEvent): HandlerResult {
  const handler = REFERENCIA_HANDLER_BY_STATE.get(session.state);
  if (handler) return handler(session, event);
  if (CURRENT_SESSION_STATES.has(session.state)) throw new UnknownStateError("handleReferencia", session.state);
  return restartRetiredReferencia(session);
}
