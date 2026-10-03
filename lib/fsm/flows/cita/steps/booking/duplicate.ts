import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { buildResult, cloneSession, query, sendButtons, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import { FAREWELL } from "@/lib/fsm/flows/cita/steps/fecha/other-fecha";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { DuplicateButtonId } from "@/lib/enums/duplicate-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";

export const DUPLICATE_CHOICE_STATE = SessionState.CITA_AWAITING_DUPLICATE_CHOICE;
export const DUPLICATE_CLOSED_STATE = SessionState.CITA_BOOKING_DUPLICATE;

const OTHER_ESPECIALIDAD_ID = DuplicateButtonId.OTHER_ESPECIALIDAD;
const EXIT_ID = DuplicateButtonId.EXIT;

const QUESTION = "El MINSA permite una sola cita activa por especialidad. ¿Deseas intentar con otra especialidad?";
const OTHER_ESPECIALIDAD_ANSWERS = new Set(["OTRA ESPECIALIDAD", "OTRA", "CAMBIAR", "CAMBIAR DE ESPECIALIDAD", "SI OTRA ESPECIALIDAD"]);
const EXIT_ANSWERS = new Set(["SALIR", "NO SALIR"]);

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

const questionButtons = (text: string) =>
  sendButtons(text, [
    { id: OTHER_ESPECIALIDAD_ID, title: "Sí, otra especialidad" },
    { id: EXIT_ID, title: "No, salir" },
  ]);

export function discardedEspecialidades(slots: Session["slots"]): string[] {
  return String(slots[SlotKey.CITA_ESPECIALIDADES_DESCARTADAS] ?? "")
    .split(",")
    .filter(Boolean);
}

export function offerOtherEspecialidad(session: Session): HandlerResult {
  const next = cloneSession(session);
  const taken = String(next.slots[SlotKey.CITA_ESPECIALIDAD_ID] ?? "");
  const name = next.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE] ? `*${String(next.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE])}*` : "esa especialidad";

  const discarded = taken ? [...new Set([...discardedEspecialidades(next.slots), taken])] : discardedEspecialidades(next.slots);
  if (discarded.length > 0) next.slots[SlotKey.CITA_ESPECIALIDADES_DESCARTADAS] = discarded.join(",");
  for (const slot of BOOKING_BOUND_SLOTS) delete next.slots[slot];
  delete next.counters[CounterKey.CITA_HORA_PAGE];
  delete next.counters[CounterKey.CITA_BOOKING_FAILURES];
  next.state = DUPLICATE_CHOICE_STATE;

  return withNote(buildResult(next, [questionButtons(`Ya tienes una cita activa para ${name}. ${QUESTION}`)]), {
    kind: "booking_rejected",
    detail: { reason: "duplicate" },
  });
}

export function handleDuplicateChoice(session: Session, event: InboundEvent): HandlerResult {
  const tapped =
    event.type === InboundEventType.BUTTON || event.type === InboundEventType.LIST ? event.listId : undefined;
  const typed = event.type === InboundEventType.TEXT ? normalizeText(event.text ?? "") : "";
  const answer = OTHER_ESPECIALIDAD_ANSWERS.has(typed)
    ? Confirmation.YES
    : EXIT_ANSWERS.has(typed)
      ? Confirmation.NO
      : resolveConfirmation(event.type === InboundEventType.TEXT ? (event.text ?? "") : "");

  if (tapped === OTHER_ESPECIALIDAD_ID || answer === Confirmation.YES) {
    const next = cloneSession(session);
    next.state = SessionState.CITA_ESPECIALIDAD_PENDING;
    return buildResult(next, [
      sendText("Buscando otras especialidades disponibles…"),
      query(QueryKind.LIST_ESPECIALIDADES, { ubigeo: String(next.slots[SlotKey.CITA_UBIGEO] ?? "") }),
    ]);
  }

  if (tapped === EXIT_ID || answer === Confirmation.NO) {
    return withNote(buildResult({ state: DUPLICATE_CLOSED_STATE, slots: {}, counters: {} }, [sendText(FAREWELL)]), {
      kind: "cita_closed",
      detail: { reason: "duplicate" },
    });
  }

  return withNote(buildResult(session, [questionButtons(QUESTION)]), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "duplicate_choice" },
  });
}
