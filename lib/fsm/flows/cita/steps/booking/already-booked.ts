import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { buildResult, cloneSession, query, sendButtons, withNote, readTappedId, readTypedText } from "@/lib/fsm/core/handlers-shared";
import { offerOtherEspecialidad, toOtherEspecialidadChoice } from "@/lib/fsm/flows/cita/steps/booking/duplicate";
import { isReferenceAppointment } from "@/lib/fsm/flows/cita/steps/booking/referencia-seleccionada";
import { discardedDates } from "@/lib/fsm/flows/cita/steps/fecha/other-fecha";
import { abandonCita } from "@/lib/fsm/flows/cita/steps/exit/exit-core";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { AlreadyBookedButtonId } from "@/lib/enums/already-booked-button-id";
import { BookingStatus } from "@/lib/enums/booking-status";
import { Confirmation } from "@/lib/enums/confirmation";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import {
  ALREADY_BOOKED_BUTTONS,
  ALREADY_BOOKED_ESPECIALIDAD_BUTTONS,
  ALREADY_BOOKED_ESPECIALIDAD_TEXT,
  ALREADY_BOOKED_QUESTION_TEXT,
} from "@/lib/constants/textos/cita-reserva";
import { ALREADY_BOOKED_EXIT_ANSWERS, CHANGE_DATE_ANSWERS } from "@/lib/constants/palabras-clave";
import { slotText } from "@/lib/fsm/core/slot-readers";

const DATE_BOUND_SLOTS = [
  SlotKey.CITA_FECHA,
  SlotKey.CITA_HORA_CONFIRM_ID,
  SlotKey.CITA_HORA_CONFIRM_ONLY,
  SlotKey.CITA_HORAS_DIA,
  SlotKey.CITA_OFFERED,
];

export function reshowAlreadyBookedChoice(session: Session): HandlerResult {
  return buildResult(session, [sendButtons(ALREADY_BOOKED_QUESTION_TEXT, ALREADY_BOOKED_BUTTONS)]);
}

function askOtherFecha(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.counters[CounterKey.CITA_ALREADY_BOOKED_REJECTIONS] = 1;
  next.state = SessionState.CITA_AWAITING_ALREADY_BOOKED_CHOICE;
  return reshowAlreadyBookedChoice(next);
}

function askOtherEspecialidad(session: Session): HandlerResult {
  if (isReferenceAppointment(session)) return offerOtherEspecialidad(session);
  const next = toOtherEspecialidadChoice(session);
  return buildResult(next, [sendButtons(ALREADY_BOOKED_ESPECIALIDAD_TEXT, ALREADY_BOOKED_ESPECIALIDAD_BUTTONS)]);
}

export function offerAlreadyBookedChoice(session: Session): HandlerResult {
  const repeated = (session.counters[CounterKey.CITA_ALREADY_BOOKED_REJECTIONS] ?? 0) > 0;
  const result = repeated ? askOtherEspecialidad(session) : askOtherFecha(session);
  return withNote(result, {
    kind: "booking_rejected",
    level: "warn",
    detail: { status: BookingStatus.ALREADY_HAS_APPOINTMENT, reason: "already_has_appointment", repeated },
  });
}

function listOtherFechas(session: Session): HandlerResult {
  const next = cloneSession(session);
  const rejected = slotText(next.slots, SlotKey.CITA_FECHA);
  const discarded = [...new Set([...discardedDates(next.slots), rejected].filter(Boolean))];
  if (discarded.length > 0) next.slots[SlotKey.CITA_FECHAS_DESCARTADAS] = discarded.join(",");
  for (const slot of DATE_BOUND_SLOTS) delete next.slots[slot];
  delete next.counters[CounterKey.CITA_HORA_PAGE];
  next.state = SessionState.CITA_FECHA_PENDING;
  return buildResult(next, [
    query(QueryKind.LIST_FECHAS, {
      codEess: slotText(next.slots, SlotKey.CITA_COD_EESS),
      especialidadId: slotText(next.slots, SlotKey.CITA_ESPECIALIDAD_ID),
    }),
  ]);
}

function readAnswer(event: InboundEvent): Confirmation {
  const typed = readTypedText(event);
  const normalized = normalizeText(typed);
  if (CHANGE_DATE_ANSWERS.has(normalized)) return Confirmation.YES;
  if (ALREADY_BOOKED_EXIT_ANSWERS.has(normalized)) return Confirmation.NO;
  return resolveConfirmation(typed);
}

export function handleAlreadyBookedChoice(session: Session, event: InboundEvent): HandlerResult {
  const tapped = readTappedId(event);
  const answer = readAnswer(event);

  if (tapped === AlreadyBookedButtonId.OTHER_FECHA || answer === Confirmation.YES) return listOtherFechas(session);
  if (tapped === AlreadyBookedButtonId.EXIT || answer === Confirmation.NO) return abandonCita(session, session.state);

  return withNote(reshowAlreadyBookedChoice(session), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "already_booked_choice" },
  });
}
