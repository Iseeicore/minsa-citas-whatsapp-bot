import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { buildResult, cloneSession, query, sendButtons, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import { FAREWELL } from "@/lib/fsm/flows/cita/steps/fecha/other-fecha";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { DuplicateButtonId } from "@/lib/enums/duplicate-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { QueryKind } from "@/lib/enums/query-kind";

export const DUPLICATE_CHOICE_STATE = "cita_awaiting_duplicate_choice";
export const DUPLICATE_CLOSED_STATE = "cita_booking_duplicate";
export const DISCARDED_ESPECIALIDADES_SLOT = "citaEspecialidadesDescartadas";

const OTHER_ESPECIALIDAD_ID = DuplicateButtonId.OTHER_ESPECIALIDAD;
const EXIT_ID = DuplicateButtonId.EXIT;

const QUESTION = "El MINSA permite una sola cita activa por especialidad. ¿Deseas intentar con otra especialidad?";
const OTHER_ESPECIALIDAD_ANSWERS = new Set(["OTRA ESPECIALIDAD", "OTRA", "CAMBIAR", "CAMBIAR DE ESPECIALIDAD", "SI OTRA ESPECIALIDAD"]);
const EXIT_ANSWERS = new Set(["SALIR", "NO SALIR"]);

const BOOKING_BOUND_SLOTS = [
  "citaEspecialidadId",
  "citaEspecialidadNombre",
  "citaCodEess",
  "citaFecha",
  "citaHoraConfirmId",
  "citaHoraConfirmOnly",
  "citaHorasDia",
  "citaFechasDescartadas",
  "citaOffered",
  "citaOfferedNames",
];

const questionButtons = (text: string) =>
  sendButtons(text, [
    { id: OTHER_ESPECIALIDAD_ID, title: "Sí, otra especialidad" },
    { id: EXIT_ID, title: "No, salir" },
  ]);

export function discardedEspecialidades(slots: Session["slots"]): string[] {
  return String(slots[DISCARDED_ESPECIALIDADES_SLOT] ?? "")
    .split(",")
    .filter(Boolean);
}

export function offerOtherEspecialidad(session: Session): HandlerResult {
  const next = cloneSession(session);
  const taken = String(next.slots.citaEspecialidadId ?? "");
  const name = next.slots.citaEspecialidadNombre ? `*${String(next.slots.citaEspecialidadNombre)}*` : "esa especialidad";

  const discarded = taken ? [...new Set([...discardedEspecialidades(next.slots), taken])] : discardedEspecialidades(next.slots);
  if (discarded.length > 0) next.slots[DISCARDED_ESPECIALIDADES_SLOT] = discarded.join(",");
  for (const slot of BOOKING_BOUND_SLOTS) delete next.slots[slot];
  delete next.counters.citaHoraPage;
  delete next.counters.citaBookingFailures;
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
    next.state = "cita_especialidad_pending";
    return buildResult(next, [
      sendText("Buscando otras especialidades disponibles…"),
      query(QueryKind.LIST_ESPECIALIDADES, { ubigeo: String(next.slots.citaUbigeo ?? "") }),
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
