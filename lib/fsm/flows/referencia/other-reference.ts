import { buildResult, readTappedId, sendButtons, withRejectionNotice } from "@/lib/fsm/core/handlers-shared";
import { clearOffered } from "@/lib/fsm/flows/cita/parsing/selection";
import { restartReferenceSelection } from "@/lib/fsm/flows/cita/steps/booking/references";
import { closeReferencia } from "@/lib/fsm/flows/referencia/close-reference";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import type { HandleEvent, HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { CITA_REFERENCIA_OTHER_BUTTONS } from "@/lib/constants/textos/cita-referencia";
import { REFERENCIA_SIN_FECHAS_TEXT } from "@/lib/constants/textos/cita-reserva";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { OtherReferenciaButtonId } from "@/lib/enums/other-referencia-button-id";
import { SessionState } from "@/lib/enums/session-state";

const BUTTON_ANSWERS = new Map<string, Confirmation>(
  Object.entries({
    [OtherReferenciaButtonId.YES]: Confirmation.YES,
    [OtherReferenciaButtonId.NO]: Confirmation.NO,
  } satisfies Record<OtherReferenciaButtonId, Confirmation>),
);

function referenceAnswer(event: InboundEvent): Confirmation {
  const tapped = readTappedId(event);
  if (tapped) return BUTTON_ANSWERS.get(tapped) ?? Confirmation.UNKNOWN;
  return event.type === InboundEventType.TEXT ? resolveConfirmation(event.text ?? "") : Confirmation.UNKNOWN;
}

export function askOtherReference(session: Session): HandlerResult {
  const next = clearOffered(session);
  next.state = SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE;
  return buildResult(next, [sendButtons(REFERENCIA_SIN_FECHAS_TEXT, CITA_REFERENCIA_OTHER_BUTTONS)]);
}

const ANSWER_HANDLERS: Readonly<Record<Confirmation, (session: Session) => HandlerResult>> = {
  [Confirmation.YES]: restartReferenceSelection,
  [Confirmation.NO]: closeReferencia,
  [Confirmation.UNKNOWN]: (session) => withRejectionNotice(askOtherReference(session)),
};

export function handleOtherReference(session: Session, event: InboundEvent): HandlerResult {
  return ANSWER_HANDLERS[referenceAnswer(event)](session);
}

export function isOtherReferenceAcceptance(session: Session, event: HandleEvent): boolean {
  return (
    session.state === SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE &&
    event.type !== InternalEventType.QUERY_RESULT &&
    referenceAnswer(event) === Confirmation.YES
  );
}

export function handleOtherReferenceClose(session: Session, event: HandleEvent): HandlerResult | undefined {
  if (session.state !== SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE || event.type === InternalEventType.QUERY_RESULT) return undefined;
  return referenceAnswer(event) === Confirmation.NO ? closeReferencia() : undefined;
}
