import { offerOtherEspecialidad } from "@/lib/fsm/flows/cita/steps/booking/duplicate";
import { offerAlreadyBookedChoice } from "@/lib/fsm/flows/cita/steps/booking/already-booked";
import { offerBookingRetry } from "@/lib/fsm/flows/cita/steps/booking/booking-retry";
import { buildResult, cloneSession, query, sendText, sendCtaUrl, withNote } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/identity/reverification";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import { SLOT_TAKEN_MESSAGE } from "@/lib/constants/regex/integrations";
import {
  APPOINTMENT_CTA_TEXT,
  APPOINTMENT_BUTTON_TEXT,
  constanciaCitaText,
  BOOKING_DEFAULT_MESSAGE_TEXT,
  BOOKING_TECHNICAL_RETRY_TEXT,
  BOOKING_SLOT_TAKEN_RETRY_TEXT,
  BOOKING_REJECTED_TEXT,
} from "@/lib/constants/textos/cita-reserva";
import { CITA_BOOKED_FAREWELL_TEXT } from "@/lib/constants/textos/cita-salida";
import { BookingStatus } from "@/lib/enums/booking-status";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { MAX_BOOKING_FAILURES } from "@/lib/constants/limits/cita";

export function handleBookingPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; url?: string; message?: string };
  const next = cloneSession(session);

  if (result.status === BookingStatus.UNAUTHORIZED) {
    return beginReverification(next, SessionState.CITA_HORA_PENDING);
  }

  if (result.status === BookingStatus.BOOKED) {
    next.state = SessionState.CITA_BOOKED;
    const constanciaText = constanciaCitaText(result.message ?? BOOKING_DEFAULT_MESSAGE_TEXT);
    return buildResult(next, [
      sendText(constanciaText),
      result.url ? sendCtaUrl(APPOINTMENT_CTA_TEXT, APPOINTMENT_BUTTON_TEXT, result.url) : sendText(CITA_BOOKED_FAREWELL_TEXT),
    ]);
  }

  if (result.status === BookingStatus.DUPLICATE) {
    return offerOtherEspecialidad(next);
  }

  if (result.status === BookingStatus.ALREADY_HAS_APPOINTMENT) {
    return offerAlreadyBookedChoice(next);
  }

  if (result.status === BookingStatus.UNAVAILABLE) {
    return offerBookingRetry(next);
  }

  const failures = (next.counters[CounterKey.CITA_BOOKING_FAILURES] ?? 0) + 1;
  const isRawError = result.status === BookingStatus.ERROR;
  const isAmbiguousRejection = result.status === BookingStatus.REJECTED && (!result.message || SLOT_TAKEN_MESSAGE.test(result.message));
  const slotMayBeGone = isRawError || isAmbiguousRejection;

  if (slotMayBeGone && failures < MAX_BOOKING_FAILURES) {
    next.counters[CounterKey.CITA_BOOKING_FAILURES] = failures;
    delete next.counters[CounterKey.CITA_HORA_PAGE];
    next.state = SessionState.CITA_HORA_PENDING;
    const retryText = isRawError ? BOOKING_TECHNICAL_RETRY_TEXT : BOOKING_SLOT_TAKEN_RETRY_TEXT;
    return withNote(
      buildResult(next, [
        sendText(retryText),
        query(QueryKind.LIST_HORAS, {
          codEess: slotText(next.slots, SlotKey.CITA_COD_EESS),
          especialidadId: slotText(next.slots, SlotKey.CITA_ESPECIALIDAD_ID),
          fecha: slotText(next.slots, SlotKey.CITA_FECHA),
        }),
      ]),
      {
        kind: "booking_retry",
        level: "warn",
        detail: { failures, status: result.status, reason: isRawError ? "http_error" : "ambiguous_rejection" },
      },
    );
  }

  next.state = SessionState.CITA_BOOKING_REJECTED;
  return withNote(buildResult(next, [sendText(result.message ?? BOOKING_REJECTED_TEXT)]), {
    kind: "booking_rejected",
    level: "warn",
    detail: { failures, status: result.status, reason: isRawError ? "http_error" : "ambiguous_rejection" },
  });
}
