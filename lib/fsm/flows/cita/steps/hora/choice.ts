import { buildResult, cloneSession, offerList, sendButtons, truncateForRow, WHATSAPP_LIST_MAX_ROWS } from "@/lib/fsm/core/handlers-shared";
import { unpackHoraSlots } from "@/lib/fsm/parsing/time-parser";
import { readOffered } from "@/lib/fsm/parsing/selection-matchers";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { NARROWED_LIST_TEXT, reshowOffered } from "@/lib/fsm/flows/cita/selection";
import { formatHora12, slotToRow } from "@/lib/fsm/flows/cita/steps/hora/format";
import { HORA_CHOICE_A_ID, HORA_CHOICE_B_ID, BUTTON_TITLE_MAX } from "@/lib/fsm/flows/cita/steps/hora/typed-hora";
import { startBooking } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";
import { handleAwaitingHoraSelect } from "@/lib/fsm/flows/cita/steps/hora/select";

export function handleHoraChoice(session: Session, event: InboundEvent): HandlerResult {
  const slotA = String(session.slots.citaHoraChoiceA ?? "");
  const slotsB = unpackHoraSlots(session.slots.citaHoraChoiceB);
  const offered = readOffered(session.slots);

  const back = () => {
    const restored = cloneSession(session);
    delete restored.slots.citaHoraChoiceA;
    delete restored.slots.citaHoraChoiceB;
    restored.state = "cita_awaiting_hora_select";
    return restored;
  };

  if (event.type === "text") return handleAwaitingHoraSelect(back(), event);

  const reply = event.type === "button" || event.type === "list" ? event.listId : undefined;

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
      { id: HORA_CHOICE_A_ID, title: truncateForRow(`Opción: ${startA}`, BUTTON_TITLE_MAX) },
      {
        id: HORA_CHOICE_B_ID,
        title: truncateForRow(slotsB.length === 1 ? `${formatHora12(first.start)}: ${first.start}` : "Ver horas", BUTTON_TITLE_MAX),
      },
    ]),
  ]);
}
