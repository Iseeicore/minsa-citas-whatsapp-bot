import { buildResult, cloneSession, sendButtons, withNote } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { ExitButtonId } from "@/lib/enums/exit-button-id";

/**
 * Separado de exit.ts a propósito: exit.ts importa handleRegistrationWait de identity.ts, así que
 * identity.ts no puede importar askToLeave de exit.ts sin crear un ciclo. Este módulo no depende de nada
 * de identity.ts, así que ambos lo pueden usar.
 */
export const EXIT_CONFIRM_STATE = "cita_awaiting_exit_confirm";
export const RESUME_SLOT = "citaExitResumeState";

export const EXIT_YES_ID = ExitButtonId.YES;
export const EXIT_NO_ID = ExitButtonId.NO;

const EXIT_QUESTION = "Parece que prefieres no continuar con tu cita. Entiendo que pueda ser frustrante. ¿Deseas salir?";

export const exitButtons = () =>
  sendButtons(EXIT_QUESTION, [
    { id: EXIT_YES_ID, title: "Sí, salir" },
    { id: EXIT_NO_ID, title: "No, continuar" },
  ]);

export function askToLeave(session: Session, source: "local" | "ai" | "reauth"): HandlerResult {
  const next = cloneSession(session);
  next.slots[RESUME_SLOT] = session.state;
  next.state = EXIT_CONFIRM_STATE;
  return withNote(buildResult(next, [exitButtons()]), {
    kind: "exit_intent",
    detail: { state: session.state, source },
  });
}
