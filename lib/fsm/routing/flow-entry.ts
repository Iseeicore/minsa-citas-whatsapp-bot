import { buildResult, sendList, sendText } from "@/lib/fsm/core/handlers-shared";
import type { CitaHints } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { MENU_PROMPT_TEXT, MENU_ROWS } from "@/lib/constants/textos/menu";

export const buildMenuEffect = () => sendList(MENU_PROMPT_TEXT, MENU_ROWS);

export function beginCita(slots: Session["slots"], hints: CitaHints, intro: string): HandlerResult {
  const next: Session = {
    state: SessionState.CITA_AWAITING_DNI,
    slots: {
      ...slots,
      ...(hints.especialidad ? { [SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]: hints.especialidad } : {}),
      ...(hints.distrito ? { [SlotKey.CITA_DISTRITO_HINT_TEXT]: hints.distrito } : {}),
    },
    counters: {},
  };
  return buildResult(next, [sendText(intro)]);
}
