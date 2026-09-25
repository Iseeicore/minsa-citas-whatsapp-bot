import { offerOtherFecha } from "@/lib/fsm/flows/cita/steps/other-fecha";
import { isSlotAcceptance, resolveConfirmation } from "@/lib/fsm/parsing/confirmation-parser";
import { normalizeText } from "@/lib/fsm/parsing/text";
import { cloneSession, withNote } from "@/lib/fsm/core/handlers-shared";
import { matchHoraText } from "@/lib/fsm/parsing/time-parser";
import { readOffered } from "@/lib/fsm/parsing/selection-matchers";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { reshowOffered } from "@/lib/fsm/flows/cita/selection";
import { ONLY_HORA_FLAG, HORA_CONFIRM_YES_ID, HORA_CONFIRM_NO_ID } from "@/lib/fsm/flows/cita/steps/hora/format";
import { askHoraConfirmation, startBooking } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";

const NEGATION_WORD = /\b(?:no|ni|nunca|tampoco)\b/;

function acceptsPendingHora(typed: string, slotId: string): boolean {
  const plain = normalizeText(typed).toLowerCase();
  if (NEGATION_WORD.test(plain)) return false;
  if (isSlotAcceptance(typed)) return true;

  const [start, end] = slotId.split("|");
  return matchHoraText(typed, [{ start, end, cupos: 0 }]).kind === "exact";
}

export function handleHoraConfirm(session: Session, event: InboundEvent): HandlerResult {
  const slotId = String(session.slots.citaHoraConfirmId ?? "");
  const [start] = slotId.split("|");
  const only = session.slots.citaHoraConfirmOnly === ONLY_HORA_FLAG;
  const offered = readOffered(session.slots);

  const backToList = () => {
    const restored = cloneSession(session);
    delete restored.slots.citaHoraConfirmId;
    delete restored.slots.citaHoraConfirmOnly;

    if (only) {
      const page = restored.counters.citaHoraPage ?? 0;
      if (!offered || page < 1) return offerOtherFecha(restored);
      restored.counters.citaHoraPage = page - 1;
    }

    restored.state = "cita_awaiting_hora_select";
    return reshowOffered(restored, offered, "Sin problema. Elige otro horario:");
  };

  if (!/^\d{2}:\d{2}$/.test(start ?? "")) return backToList();

  const reply = event.type === "button" || event.type === "list" ? event.listId : undefined;
  const typedText = event.type === "text" ? (event.text ?? "") : "";
  const typed = event.type === "text" ? resolveConfirmation(typedText) : "UNKNOWN";
  const takesThatHora = typed === "UNKNOWN" && event.type === "text" && acceptsPendingHora(typedText, slotId);

  if (reply === HORA_CONFIRM_YES_ID || typed === "YES" || takesThatHora) return startBooking(session, start);
  if (reply === HORA_CONFIRM_NO_ID || typed === "NO") return backToList();

  return withNote(askHoraConfirmation(session, slotId, { only }), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "hora_confirm" },
  });
}
