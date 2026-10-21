import {
  buildResult,
  cloneSession,
  omitSlot,
  readTappedId,
  sendButtons,
  sendText,
  withLeadingText,
  withRejectionNotice,
} from "@/lib/fsm/core/handlers-shared";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { continueCitaAfterVerification } from "@/lib/fsm/flows/cita/steps/identity/identity";
import { offerReferenciasList } from "@/lib/fsm/flows/cita/steps/booking/references";
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import type { ListReferencesResult } from "@/lib/integrations/minsa/types";
import {
  REFERENCIA_CITA_OFFER_BUTTONS,
  REFERENCIA_CITA_OFFER_QUESTION_TEXT,
  REFERENCIA_GOODBYE_TEXT,
  REFERENCIA_LOGIN_REQUIRED_TEXT,
  REFERENCIA_LOOKUP_FAILED_TEXT,
  REFERENCIA_NONE_TEXT,
} from "@/lib/constants/textos/referencia";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { ReferenciaCitaOfferButtonId } from "@/lib/enums/referencia-cita-offer-button-id";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { UnknownStateError } from "@/lib/errors/unknown-state-error";

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

  if (result.statusReference === ReferenceStatus.FOUND && result.data.length > 0) {
    next.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify(result.data);
    return offerReferenciasList(next);
  }

  next.state = SessionState.REFERENCIA_AWAITING_CITA_OFFER;
  const leadingText = result.statusReference === ReferenceStatus.ERROR ? REFERENCIA_LOOKUP_FAILED_TEXT : REFERENCIA_NONE_TEXT;
  return withLeadingText(askCitaOffer(next), leadingText);
}

export function handleReferenciaAwaitingCitaOffer(session: Session, event: InboundEvent): HandlerResult {
  const reply = readTappedId(event);
  const typed = event.type === InboundEventType.TEXT ? resolveConfirmation(event.text ?? "") : Confirmation.UNKNOWN;

  if (reply === ReferenciaCitaOfferButtonId.YES || typed === Confirmation.YES) {
    return continueCitaAfterVerification({ ...session, slots: omitSlot(session.slots, SlotKey.POST_LOGIN_FLOW) });
  }

  if (reply === ReferenciaCitaOfferButtonId.NO || typed === Confirmation.NO) {
    return buildResult({ state: SessionState.REFERENCIA_CLOSED, slots: {}, counters: {} }, [sendText(REFERENCIA_GOODBYE_TEXT)]);
  }

  return withRejectionNotice(askCitaOffer(session));
}

export function handleReferencia(session: Session, event: HandleEvent): HandlerResult {
  switch (session.state) {
    case SessionState.REFERENCIA_LOOKUP_PENDING:
      return handleReferenciaLookupPending(session, event as QueryResultEvent);
    case SessionState.REFERENCIA_AWAITING_CITA_OFFER:
      return handleReferenciaAwaitingCitaOffer(session, event as InboundEvent);
    default:
      throw new UnknownStateError("handleReferencia", session.state);
  }
}
