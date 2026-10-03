import { offerOtherFecha } from "@/lib/fsm/flows/cita/steps/fecha/other-fecha";
import { isSlotAcceptance, resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { cloneSession, withNote } from "@/lib/fsm/core/handlers-shared";
import { matchHoraText } from "@/lib/fsm/parsing/date/time-parser";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { reshowOffered } from "@/lib/fsm/flows/cita/parsing/selection";
import { ONLY_HORA_FLAG, HORA_CONFIRM_YES_ID, HORA_CONFIRM_NO_ID } from "@/lib/fsm/flows/cita/steps/hora/format";
import { askHoraConfirmation, startBooking } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";

const NEGATION_WORD = /\b(?:no|ni|nunca|tampoco)\b/;

function acceptsPendingHora(typed: string, slotId: string): boolean {
  const plain = normalizeText(typed).toLowerCase();
  if (NEGATION_WORD.test(plain)) return false;
  if (isSlotAcceptance(typed)) return true;

  const [start, end] = slotId.split("|");
  return matchHoraText(typed, [{ start, end, cupos: 0 }]).kind === "exact";
}

export function handleHoraConfirm(session: Session, event: InboundEvent): HandlerResult {
  const slotId = String(session.slots[SlotKey.CITA_HORA_CONFIRM_ID] ?? "");
  const [start] = slotId.split("|");
  const only = session.slots[SlotKey.CITA_HORA_CONFIRM_ONLY] === ONLY_HORA_FLAG;
  const offered = readOffered(session.slots);

  const backToList = () => {
    const restored = cloneSession(session);
    delete restored.slots[SlotKey.CITA_HORA_CONFIRM_ID];
    delete restored.slots[SlotKey.CITA_HORA_CONFIRM_ONLY];

    if (only) {
      const page = restored.counters[CounterKey.CITA_HORA_PAGE] ?? 0;
      if (!offered || page < 1) return offerOtherFecha(restored);
      restored.counters[CounterKey.CITA_HORA_PAGE] = page - 1;
    }

    restored.state = SessionState.CITA_AWAITING_HORA_SELECT;
    return reshowOffered(restored, offered, "Sin problema. Elige otro horario:");
  };

  if (!/^\d{2}:\d{2}$/.test(start ?? "")) return backToList();

  const reply =
    event.type === InboundEventType.BUTTON || event.type === InboundEventType.LIST ? event.listId : undefined;
  const typedText = event.type === InboundEventType.TEXT ? (event.text ?? "") : "";
  const typed = event.type === InboundEventType.TEXT ? resolveConfirmation(typedText) : Confirmation.UNKNOWN;
  const takesThatHora =
    typed === Confirmation.UNKNOWN && event.type === InboundEventType.TEXT && acceptsPendingHora(typedText, slotId);

  if (reply === HORA_CONFIRM_YES_ID || typed === Confirmation.YES || takesThatHora) return startBooking(session, start);
  if (reply === HORA_CONFIRM_NO_ID || typed === Confirmation.NO) return backToList();

  return withNote(askHoraConfirmation(session, slotId, { only }), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "hora_confirm" },
  });
}
