import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import {
  buildResult,
  cloneSession,
  query,
  sendButtons,
  sendText,
  withNote,
  readTappedId,
  readTypedText,
  withLeadingText,
} from "@/lib/fsm/core/handlers-shared";
import { isReferenceAppointment } from "@/lib/fsm/flows/cita/steps/booking/referencia-seleccionada";
import { startNewAppointment } from "@/lib/fsm/flows/referencia/new-appointment";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { DuplicateButtonId } from "@/lib/enums/duplicate-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import { CITA_FAREWELL_TEXT } from "@/lib/constants/textos/cita-salida";
import { THAT_ESPECIALIDAD_TEXT } from "@/lib/constants/textos/cita-catalogo";
import {
  DUPLICATE_QUESTION_TEXT,
  duplicateActiveText,
  DUPLICATE_BUTTONS,
  REFERENCIA_DUPLICATE_TEXT,
} from "@/lib/constants/textos/cita-reserva";
import { OTHER_ESPECIALIDAD_ANSWERS, DUPLICATE_EXIT_ANSWERS } from "@/lib/constants/palabras-clave";
import { slotText } from "@/lib/fsm/core/slot-readers";

const BOOKING_BOUND_SLOTS = [
  SlotKey.CITA_ESPECIALIDAD_ID,
  SlotKey.CITA_ESPECIALIDAD_NOMBRE,
  SlotKey.CITA_COD_EESS,
  SlotKey.CITA_FECHA,
  SlotKey.CITA_HORA_CONFIRM_ID,
  SlotKey.CITA_HORA_CONFIRM_ONLY,
  SlotKey.CITA_HORAS_DIA,
  SlotKey.CITA_FECHAS_DESCARTADAS,
  SlotKey.CITA_OFFERED,
  SlotKey.CITA_OFFERED_NAMES,
];

const questionButtons = (text: string) => sendButtons(text, DUPLICATE_BUTTONS);

export function discardedEspecialidades(slots: Session["slots"]): string[] {
  return slotText(slots, SlotKey.CITA_ESPECIALIDADES_DESCARTADAS).split(",").filter(Boolean);
}

export function withDiscardedEspecialidad(slots: Session["slots"]): Session["slots"] {
  const especialidadId = slotText(slots, SlotKey.CITA_ESPECIALIDAD_ID);
  const descartadas = new Set(discardedEspecialidades(slots));

  if (especialidadId) {
    descartadas.add(especialidadId);
  }

  if (descartadas.size === 0) {
    return slots;
  }

  return {
    ...slots,
    [SlotKey.CITA_ESPECIALIDADES_DESCARTADAS]: [...descartadas].join(","),
  };
}

export function toOtherEspecialidadChoice(session: Session): Session {
  const next = cloneSession(session);
  next.slots = withDiscardedEspecialidad(next.slots);
  for (const slot of BOOKING_BOUND_SLOTS) delete next.slots[slot];
  delete next.counters[CounterKey.CITA_HORA_PAGE];
  delete next.counters[CounterKey.CITA_BOOKING_FAILURES];
  delete next.counters[CounterKey.CITA_ALREADY_BOOKED_REJECTIONS];
  next.state = SessionState.CITA_AWAITING_DUPLICATE_CHOICE;
  return next;
}

export function offerOtherEspecialidad(session: Session): HandlerResult {
  if (isReferenceAppointment(session)) {
    return withLeadingText(startNewAppointment(session), REFERENCIA_DUPLICATE_TEXT);
  }
  const name = session.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE]
    ? `*${String(session.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE])}*`
    : THAT_ESPECIALIDAD_TEXT;
  const next = toOtherEspecialidadChoice(session);

  return withNote(buildResult(next, [questionButtons(duplicateActiveText(name))]), {
    kind: "booking_rejected",
    detail: { reason: "duplicate" },
  });
}

export function handleDuplicateChoice(session: Session, event: InboundEvent): HandlerResult {
  const tapped = readTappedId(event);
  const typed = event.type === InboundEventType.TEXT ? normalizeText(event.text ?? "") : "";
  const answer = OTHER_ESPECIALIDAD_ANSWERS.has(typed)
    ? Confirmation.YES
    : DUPLICATE_EXIT_ANSWERS.has(typed)
      ? Confirmation.NO
      : resolveConfirmation(readTypedText(event));

  if (tapped === DuplicateButtonId.OTHER_ESPECIALIDAD || answer === Confirmation.YES) {
    const next = cloneSession(session);
    next.state = SessionState.CITA_ESPECIALIDAD_PENDING;
    return buildResult(next, [query(QueryKind.LIST_ESPECIALIDADES, { ubigeo: slotText(next.slots, SlotKey.CITA_UBIGEO) })]);
  }

  if (tapped === DuplicateButtonId.EXIT || answer === Confirmation.NO) {
    return withNote(buildResult({ state: SessionState.CITA_BOOKING_DUPLICATE, slots: {}, counters: {} }, [sendText(CITA_FAREWELL_TEXT)]), {
      kind: "cita_closed",
      detail: { reason: "duplicate" },
    });
  }

  return withNote(buildResult(session, [questionButtons(DUPLICATE_QUESTION_TEXT)]), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "duplicate_choice" },
  });
}
