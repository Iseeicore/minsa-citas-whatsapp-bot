import { buildResult, cloneSession, query, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { resolveSelection } from "@/lib/fsm/flows/cita/parsing/selection";
import { matchHoraTyped } from "@/lib/fsm/flows/cita/steps/hora/typed-hora";
import { askHoraConfirmation, chooseHora } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import { SELECTION_REJECTION_TEXT } from "@/lib/constants/textos/comunes";
import { HoraPageButtonId } from "@/lib/enums/hora-page-button-id";
import { slotText } from "@/lib/fsm/core/slot-readers";

export function handleAwaitingHoraSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, {
    passthroughIds: [HoraPageButtonId.NEXT, HoraPageButtonId.PREV],
    customMatch: (typed, rows) => matchHoraTyped(session, typed, rows),
  });
  if ("result" in outcome) return outcome.result;
  const replyId = outcome.replyId;

  if (replyId === HoraPageButtonId.NEXT || replyId === HoraPageButtonId.PREV) {
    const next = cloneSession(session);
    const currentPage = next.counters[CounterKey.CITA_HORA_PAGE] ?? 0;
    next.counters[CounterKey.CITA_HORA_PAGE] = Math.max(0, currentPage + (replyId === HoraPageButtonId.NEXT ? 1 : -1));
    next.state = SessionState.CITA_HORA_PAGE_PENDING;
    return buildResult(next, [
      query(QueryKind.LIST_HORAS, {
        codEess: slotText(next.slots, SlotKey.CITA_COD_EESS),
        especialidadId: slotText(next.slots, SlotKey.CITA_ESPECIALIDAD_ID),
        fecha: slotText(next.slots, SlotKey.CITA_FECHA),
      }),
    ]);
  }

  if (!replyId || !replyId.includes("|")) {
    return buildResult(session, [sendText(SELECTION_REJECTION_TEXT)]);
  }

  if (outcome.typed !== undefined) return askHoraConfirmation(session, replyId);

  return chooseHora(session, replyId);
}
