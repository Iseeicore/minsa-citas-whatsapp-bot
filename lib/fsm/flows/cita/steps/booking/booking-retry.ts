import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { buildResult, cloneSession, sendButtons, sendText, withNote, readTappedId, readTypedText } from "@/lib/fsm/core/handlers-shared";
import { bookingQuery } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";
import { abandonCita } from "@/lib/fsm/flows/cita/steps/exit/exit-core";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { BookingRetryButtonId } from "@/lib/enums/booking-retry-button-id";
import { BookingStatus } from "@/lib/enums/booking-status";
import { Confirmation } from "@/lib/enums/confirmation";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import {
  BOOKING_RETRIES_EXHAUSTED_TEXT,
  BOOKING_RETRY_BUTTONS,
  BOOKING_RETRYING_TEXT,
  BOOKING_SERVICE_UNAVAILABLE_TEXT,
} from "@/lib/constants/textos/cita-reserva";
import { BOOKING_EXIT_ANSWERS, BOOKING_RETRY_ANSWERS } from "@/lib/constants/palabras-clave";
import { MAX_BOOKING_RETRIES } from "@/lib/constants/limits/cita";

const retriesOf = (session: Session): number => session.counters[CounterKey.CITA_BOOKING_RETRIES] ?? 0;

export function reshowBookingRetry(session: Session): HandlerResult {
  return buildResult(session, [sendButtons(BOOKING_SERVICE_UNAVAILABLE_TEXT, BOOKING_RETRY_BUTTONS)]);
}

export function offerBookingRetry(session: Session): HandlerResult {
  const retries = retriesOf(session);
  const next = cloneSession(session);

  if (retries >= MAX_BOOKING_RETRIES) {
    next.state = SessionState.CITA_BOOKING_REJECTED;
    return withNote(buildResult(next, [sendText(BOOKING_RETRIES_EXHAUSTED_TEXT)]), {
      kind: "booking_rejected",
      level: "warn",
      detail: { status: BookingStatus.UNAVAILABLE, reason: "retries_exhausted", retries },
    });
  }

  next.state = SessionState.CITA_AWAITING_BOOKING_RETRY;
  return withNote(reshowBookingRetry(next), {
    kind: "booking_retry",
    level: "warn",
    detail: { status: BookingStatus.UNAVAILABLE, reason: "service_unavailable", retries },
  });
}

function retryBooking(session: Session): HandlerResult {
  const attempt = retriesOf(session) + 1;
  const next = cloneSession(session);
  next.counters[CounterKey.CITA_BOOKING_RETRIES] = attempt;
  next.state = SessionState.CITA_BOOKING_PENDING;
  return buildResult(next, [sendText(BOOKING_RETRYING_TEXT), bookingQuery(next, { retryAttempt: attempt })]);
}

function readAnswer(event: InboundEvent): Confirmation {
  const typed = readTypedText(event);
  const normalized = normalizeText(typed);
  if (BOOKING_RETRY_ANSWERS.has(normalized)) return Confirmation.YES;
  if (BOOKING_EXIT_ANSWERS.has(normalized)) return Confirmation.NO;
  return resolveConfirmation(typed);
}

export function handleBookingRetryChoice(session: Session, event: InboundEvent): HandlerResult {
  const tapped = readTappedId(event);
  const answer = readAnswer(event);

  if (tapped === BookingRetryButtonId.RETRY || answer === Confirmation.YES) return retryBooking(session);
  if (tapped === BookingRetryButtonId.EXIT || answer === Confirmation.NO) return abandonCita(session, session.state);

  return withNote(reshowBookingRetry(session), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "booking_retry" },
  });
}
