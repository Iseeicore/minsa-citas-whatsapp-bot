import { buildResult, cloneSession, offerList, sendButtons, truncateForRow, WHATSAPP_LIST_MAX_ROWS } from "@/lib/fsm/core/handlers-shared";
import { unpackHoraSlots } from "@/lib/fsm/parsing/date/time-parser";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { NARROWED_LIST_TEXT, reshowOffered } from "@/lib/fsm/flows/cita/parsing/selection";
import { formatHora12, slotToRow } from "@/lib/fsm/flows/cita/steps/hora/format";
import { HORA_CHOICE_A_ID, HORA_CHOICE_B_ID, BUTTON_TITLE_MAX } from "@/lib/fsm/flows/cita/steps/hora/typed-hora";
import { startBooking } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";
import { handleAwaitingHoraSelect } from "@/lib/fsm/flows/cita/steps/hora/select";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

export function handleHoraChoice(session: Session, event: InboundEvent): HandlerResult {
  const slotA = String(session.slots[SlotKey.CITA_HORA_CHOICE_A] ?? "");
  const slotsB = unpackHoraSlots(session.slots[SlotKey.CITA_HORA_CHOICE_B]);
  const offered = readOffered(session.slots);

  const back = () => {
    const restored = cloneSession(session);
    delete restored.slots[SlotKey.CITA_HORA_CHOICE_A];
    delete restored.slots[SlotKey.CITA_HORA_CHOICE_B];
    restored.state = SessionState.CITA_AWAITING_HORA_SELECT;
    return restored;
  };

  if (event.type === InboundEventType.TEXT) return handleAwaitingHoraSelect(back(), event);

  const reply =
    event.type === InboundEventType.BUTTON || event.type === InboundEventType.LIST ? event.listId : undefined;

  if (reply === HORA_CHOICE_A_ID && /^\d{2}:\d{2}\|/.test(slotA)) {
    return startBooking(back(), slotA.split("|")[0]);
  }

  if (reply === HORA_CHOICE_B_ID && slotsB.length === 1) {
    return startBooking(back(), slotsB[0].start);
  }

  if (reply === HORA_CHOICE_B_ID && slotsB.length > 1) {
    const restored = back();
    return buildResult(restored, [offerList(restored, NARROWED_LIST_TEXT, slotsB.slice(0, WHATSAPP_LIST_MAX_ROWS).map(slotToRow))]);
  }

  const [startA] = slotA.split("|");
  const first = slotsB[0];
  if (!/^\d{2}:\d{2}$/.test(startA ?? "") || !first) return reshowOffered(back(), offered);

  return buildResult(session, [
    sendButtons("Elige una de las dos opciones:", [
      { id: HORA_CHOICE_A_ID, title: truncateForRow(`Opción: ${formatHora12(startA)}`, BUTTON_TITLE_MAX) },
      {
        id: HORA_CHOICE_B_ID,
        title: truncateForRow(slotsB.length === 1 ? formatHora12(first.start) : "Ver horas", BUTTON_TITLE_MAX),
      },
    ]),
  ]);
}
