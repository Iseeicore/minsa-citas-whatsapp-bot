import { buildResult, readTappedId, readTypedText, sendButtons, withRejectionNotice } from "@/lib/fsm/core/handlers-shared";
import { clearOffered } from "@/lib/fsm/flows/cita/parsing/selection";
import { restartReferenceSelection } from "@/lib/fsm/flows/cita/steps/booking/references";
import { closeReferencia } from "@/lib/fsm/flows/referencia/close-reference";
import { startNewAppointment } from "@/lib/fsm/flows/referencia/new-appointment";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { detectExitIntent } from "@/lib/fsm/parsing/selection/exit-intent";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import type { HandleEvent, HandlerAttempt, HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import {
  CITA_REFERENCIA_OTHER_BUTTONS,
  CITA_REFERENCIA_SIN_FECHAS_BUTTONS,
  CITA_REFERENCIA_SIN_FECHAS_TEXT,
} from "@/lib/constants/textos/cita-referencia";
import { REFERENCIA_SIN_FECHAS_TEXT } from "@/lib/constants/textos/cita-reserva";
import { CITA_REFERENCIA_SIN_FECHAS_ANSWERS } from "@/lib/constants/palabras-clave";
import { AppointmentMode } from "@/lib/enums/appointment-mode";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { OtherReferenciaButtonId } from "@/lib/enums/other-referencia-button-id";
import { OtherReferenciaCitaButtonId } from "@/lib/enums/other-referencia-cita-button-id";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

const BUTTON_ANSWERS = new Map<string, Confirmation>(
  Object.entries({
    [OtherReferenciaButtonId.YES]: Confirmation.YES,
    [OtherReferenciaButtonId.NO]: Confirmation.NO,
  } satisfies Record<OtherReferenciaButtonId, Confirmation>),
);

const APPOINTMENT_BUTTON_IDS: ReadonlySet<string> = new Set(Object.values(OtherReferenciaCitaButtonId));

const isAppointmentPath = (session: Session): boolean => session.slots[SlotKey.CITA_APPOINTMENT_MODE] === AppointmentMode.REFERENCE;

function referenceAnswer(event: InboundEvent): Confirmation {
  const tapped = readTappedId(event);
  if (tapped) return BUTTON_ANSWERS.get(tapped) ?? Confirmation.UNKNOWN;
  return event.type === InboundEventType.TEXT ? resolveConfirmation(event.text ?? "") : Confirmation.UNKNOWN;
}

function appointmentAnswer(event: InboundEvent): OtherReferenciaCitaButtonId | undefined {
  const tapped = readTappedId(event);
  if (tapped) return APPOINTMENT_BUTTON_IDS.has(tapped) ? (tapped as OtherReferenciaCitaButtonId) : undefined;
  return CITA_REFERENCIA_SIN_FECHAS_ANSWERS.get(normalizeText(readTypedText(event)));
}

function isTypedExit(event: InboundEvent): boolean {
  const typed = event.type === InboundEventType.TEXT ? (event.text ?? "") : "";
  return resolveConfirmation(typed) === Confirmation.NO && detectExitIntent(typed);
}

export function askOtherReference(session: Session): HandlerResult {
  const next = clearOffered(session);
  next.state = SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE;
  const question = isAppointmentPath(next)
    ? sendButtons(CITA_REFERENCIA_SIN_FECHAS_TEXT, CITA_REFERENCIA_SIN_FECHAS_BUTTONS)
    : sendButtons(REFERENCIA_SIN_FECHAS_TEXT, CITA_REFERENCIA_OTHER_BUTTONS);
  return buildResult(next, [question]);
}

const ANSWER_HANDLERS: Readonly<Record<Confirmation, (session: Session) => HandlerResult>> = {
  [Confirmation.YES]: restartReferenceSelection,
  [Confirmation.NO]: closeReferencia,
  [Confirmation.UNKNOWN]: (session) => withRejectionNotice(askOtherReference(session)),
};

const APPOINTMENT_HANDLERS: Readonly<Record<OtherReferenciaCitaButtonId, (session: Session) => HandlerResult>> = {
  [OtherReferenciaCitaButtonId.REFERENCES]: restartReferenceSelection,
  [OtherReferenciaCitaButtonId.NEW_APPOINTMENT]: startNewAppointment,
};

export function handleOtherReference(session: Session, event: InboundEvent): HandlerResult {
  if (!isAppointmentPath(session)) return ANSWER_HANDLERS[referenceAnswer(event)](session);
  const answer = appointmentAnswer(event);
  return answer ? APPOINTMENT_HANDLERS[answer](session) : withRejectionNotice(askOtherReference(session));
}

export function isOtherReferenceAcceptance(session: Session, event: HandleEvent): boolean {
  if (session.state !== SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE || event.type === InternalEventType.QUERY_RESULT) return false;
  return isAppointmentPath(session)
    ? appointmentAnswer(event) === OtherReferenciaCitaButtonId.REFERENCES
    : referenceAnswer(event) === Confirmation.YES;
}

export function handleOtherReferenceClose(session: Session, event: HandleEvent): HandlerAttempt {
  if (session.state !== SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE || event.type === InternalEventType.QUERY_RESULT) return undefined;
  const closes = isAppointmentPath(session) ? isTypedExit(event) : referenceAnswer(event) === Confirmation.NO;
  return closes ? closeReferencia() : undefined;
}
