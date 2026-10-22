import { CLOCK_TIME } from "@/lib/constants/regex/text";
import { buildResult, cloneSession, offerList, sendButtons, truncateForRow, readTappedId } from "@/lib/fsm/core/handlers-shared";
import { unpackHoraSlots } from "@/lib/fsm/parsing/date/time-parser";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { reshowOffered } from "@/lib/fsm/flows/cita/parsing/selection";
import { formatHora12, slotToRow } from "@/lib/fsm/flows/cita/steps/hora/format";
import { chooseHora } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";
import { handleAwaitingHoraSelect } from "@/lib/fsm/flows/cita/steps/hora/select";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { SLOT_STARTING_WITH_CLOCK_TIME } from "@/lib/constants/regex/date-time";
import { NARROWED_LIST_TEXT } from "@/lib/constants/textos/comunes";
import { HORA_CHOICE_PROMPT_TEXT, horaOptionText, SEE_HORAS_BUTTON_TEXT } from "@/lib/constants/textos/cita-fecha-hora";
import { HoraChoiceButtonId } from "@/lib/enums/hora-choice-button-id";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { WHATSAPP_LIST_MAX_ROWS, BUTTON_TITLE_MAX } from "@/lib/constants/limits/whatsapp";

export function handleHoraChoice(session: Session, event: InboundEvent): HandlerResult {
  const slotA = slotText(session.slots, SlotKey.CITA_HORA_CHOICE_A);
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

  const reply = readTappedId(event);

  if (reply === HoraChoiceButtonId.A && SLOT_STARTING_WITH_CLOCK_TIME.test(slotA)) {
    return chooseHora(back(), slotA);
  }

  if (reply === HoraChoiceButtonId.B && slotsB.length === 1) {
    return chooseHora(back(), `${slotsB[0].start}|${slotsB[0].end}`);
  }

  if (reply === HoraChoiceButtonId.B && slotsB.length > 1) {
    const restored = back();
    return buildResult(restored, [offerList(restored, NARROWED_LIST_TEXT, slotsB.slice(0, WHATSAPP_LIST_MAX_ROWS).map(slotToRow))]);
  }

  const [startA] = slotA.split("|");
  const first = slotsB[0];
  if (!CLOCK_TIME.test(startA ?? "") || !first) return reshowOffered(back(), offered);

  return buildResult(session, [
    sendButtons(HORA_CHOICE_PROMPT_TEXT, [
      { id: HoraChoiceButtonId.A, title: truncateForRow(horaOptionText(formatHora12(startA)), BUTTON_TITLE_MAX) },
      {
        id: HoraChoiceButtonId.B,
        title: truncateForRow(slotsB.length === 1 ? formatHora12(first.start) : SEE_HORAS_BUTTON_TEXT, BUTTON_TITLE_MAX),
      },
    ]),
  ]);
}
