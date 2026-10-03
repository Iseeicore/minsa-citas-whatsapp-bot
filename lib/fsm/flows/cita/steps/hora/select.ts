import { buildResult, cloneSession, query, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { resolveSelection } from "@/lib/fsm/flows/cita/parsing/selection";
import { HORA_PAGE_PREV_ID, HORA_PAGE_NEXT_ID } from "@/lib/fsm/flows/cita/steps/hora/format";
import { matchHoraTyped } from "@/lib/fsm/flows/cita/steps/hora/typed-hora";
import { askHoraConfirmation, startBooking } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";

export function handleAwaitingHoraSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, {
    passthroughIds: [HORA_PAGE_NEXT_ID, HORA_PAGE_PREV_ID],
    customMatch: (typed, rows) => matchHoraTyped(session, typed, rows),
  });
  if ("result" in outcome) return outcome.result;
  const replyId = outcome.replyId;

  if (replyId === HORA_PAGE_NEXT_ID || replyId === HORA_PAGE_PREV_ID) {
    const next = cloneSession(session);
    const currentPage = next.counters[CounterKey.CITA_HORA_PAGE] ?? 0;
    next.counters[CounterKey.CITA_HORA_PAGE] = Math.max(0, currentPage + (replyId === HORA_PAGE_NEXT_ID ? 1 : -1));
    next.state = "cita_hora_page_pending";
    return buildResult(next, [
      sendText("Buscando más horarios…"),
      query(QueryKind.LIST_HORAS, {
        codEess: String(next.slots[SlotKey.CITA_COD_EESS] ?? ""),
        especialidadId: String(next.slots[SlotKey.CITA_ESPECIALIDAD_ID] ?? ""),
        fecha: String(next.slots[SlotKey.CITA_FECHA] ?? ""),
      }),
    ]);
  }

  if (!replyId || !replyId.includes("|")) {
    return buildResult(session, [sendText("Selecciona una opción de la lista.")]);
  }

  if (outcome.typed !== undefined) return askHoraConfirmation(session, replyId);

  const [horaInicio] = replyId.split("|");
  return startBooking(session, horaInicio);
}
