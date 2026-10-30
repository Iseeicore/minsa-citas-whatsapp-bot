import { buildResult, cloneSession, sendButtons, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import {
  CITA_ABANDONED_TEXT,
  EXIT_BUTTONS,
  EXIT_QUESTION_TEXT,
  REFERENCIA_ABANDONED_TEXT,
  REFERENCIA_EXIT_QUESTION_TEXT,
} from "@/lib/constants/textos/cita-salida";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";

const isReferenciasPurpose = (session: Session): boolean => session.slots[SlotKey.POST_LOGIN_FLOW] === PostLoginFlow.REFERENCIAS;

export const exitButtons = (session: Session) =>
  sendButtons(isReferenciasPurpose(session) ? REFERENCIA_EXIT_QUESTION_TEXT : EXIT_QUESTION_TEXT, EXIT_BUTTONS);

export const abandonedText = (session: Session): string =>
  isReferenciasPurpose(session) ? REFERENCIA_ABANDONED_TEXT : CITA_ABANDONED_TEXT;

export function abandonCita(session: Session, from: string): HandlerResult {
  return withNote(buildResult({ state: SessionState.CITA_ABANDONED, slots: {}, counters: {} }, [sendText(abandonedText(session))]), {
    kind: "cita_closed",
    detail: { reason: "abandoned", from },
  });
}

export function askToLeave(session: Session, source: "local" | "ai" | "reauth"): HandlerResult {
  const next = cloneSession(session);
  next.slots[SlotKey.CITA_EXIT_RESUME_STATE] = session.state;
  next.state = SessionState.CITA_AWAITING_EXIT_CONFIRM;
  return withNote(buildResult(next, [exitButtons(session)]), {
    kind: "exit_intent",
    detail: { state: session.state, source },
  });
}
