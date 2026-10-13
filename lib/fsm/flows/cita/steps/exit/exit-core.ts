import { buildResult, cloneSession, sendButtons, withNote } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { EXIT_QUESTION_TEXT, EXIT_BUTTONS } from "@/lib/constants/textos/cita-salida";

export const exitButtons = () => sendButtons(EXIT_QUESTION_TEXT, EXIT_BUTTONS);

export function askToLeave(session: Session, source: "local" | "ai" | "reauth"): HandlerResult {
  const next = cloneSession(session);
  next.slots[SlotKey.CITA_EXIT_RESUME_STATE] = session.state;
  next.state = SessionState.CITA_AWAITING_EXIT_CONFIRM;
  return withNote(buildResult(next, [exitButtons()]), {
    kind: "exit_intent",
    detail: { state: session.state, source },
  });
}
