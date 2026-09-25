import { buildResult, cloneSession, query, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { resolveSelection } from "@/lib/fsm/flows/cita/selection";
import { HORA_PAGE_PREV_ID, HORA_PAGE_NEXT_ID } from "@/lib/fsm/flows/cita/steps/hora/format";
import { matchHoraTyped } from "@/lib/fsm/flows/cita/steps/hora/typed-hora";
import { askHoraConfirmation, startBooking } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";

export function handleAwaitingHoraSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, {
    passthroughIds: [HORA_PAGE_NEXT_ID, HORA_PAGE_PREV_ID],
    customMatch: (typed, rows) => matchHoraTyped(session, typed, rows),
  });
  if ("result" in outcome) return outcome.result;
  const replyId = outcome.replyId;

  if (replyId === HORA_PAGE_NEXT_ID || replyId === HORA_PAGE_PREV_ID) {
    const next = cloneSession(session);
    const currentPage = next.counters.citaHoraPage ?? 0;
    next.counters.citaHoraPage = Math.max(0, currentPage + (replyId === HORA_PAGE_NEXT_ID ? 1 : -1));
    next.state = "cita_hora_page_pending";
    return buildResult(next, [
      sendText("Buscando más horarios…"),
      query("list_horas", {
        codEess: String(next.slots.citaCodEess ?? ""),
        especialidadId: String(next.slots.citaEspecialidadId ?? ""),
        fecha: String(next.slots.citaFecha ?? ""),
      }),
    ]);
  }

  if (!replyId || !replyId.includes("|")) {
    return buildResult(session, [sendText("Selecciona una opción de la lista.")]);
  }

  // Typed text (a time or a list position) is confirmed before booking; a tap
  // on a list row is already an explicit choice.
  if (outcome.typed !== undefined) return askHoraConfirmation(session, replyId);

  const [horaInicio] = replyId.split("|");
  return startBooking(session, horaInicio);
}
