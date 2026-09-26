import { buildResult, query, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import { OFFERED_SLOT } from "@/lib/fsm/parsing/selection-matchers";
import { resumeStateFor } from "@/lib/fsm/session/session-expiry-guard";
import { resolveConfirmation } from "@/lib/fsm/parsing/confirmation-parser";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { askToLeave } from "@/lib/fsm/flows/cita/steps/exit";
import { REAUTH_NO_ID, REAUTH_STATE, REAUTH_YES_ID, reauthPrompt } from "@/lib/fsm/session/reauth-prompt";

const TRANSIENT_BOOKING_SLOTS = [
  "citaBearer",
  "citaHorasDia",
  "citaHoraConfirmId",
  "citaHoraConfirmOnly",
  "citaHoraChoiceA",
  "citaHoraChoiceB",
  OFFERED_SLOT,
];

export function beginSessionReauth(session: Session): HandlerResult {
  const next: Session = {
    state: REAUTH_STATE,
    slots: { ...session.slots },
    counters: { ...session.counters },
  };
  for (const slot of TRANSIENT_BOOKING_SLOTS) delete next.slots[slot];
  delete next.counters.citaHoraPage;
  delete next.slots.citaExitResumeState;

  const resumeState = resumeStateFor(session.state, session.slots);
  if (resumeState) next.slots.citaResumeState = resumeState;

  return buildResult(next, [reauthPrompt()]);
}

export function handleAwaitingReauth(session: Session, event: InboundEvent): HandlerResult {
  const tapped = event.type === "button" || event.type === "list" ? event.listId : undefined;
  const typed = event.type === "text" ? resolveConfirmation(event.text ?? "") : "UNKNOWN";

  if (tapped === REAUTH_NO_ID || typed === "NO") return askToLeave(session, "reauth");

  if (tapped === REAUTH_YES_ID || typed === "YES") {
    const dni = session.slots.citaDni;
    const next: Session = { state: "cita_awaiting_dni", slots: { ...session.slots }, counters: { ...session.counters } };

    if (typeof dni !== "string" || dni === "") {
      return buildResult(next, [sendText("Para enviarte un nuevo código, ingresa tu número de documento (8 dígitos).")]);
    }

    next.state = "cita_validate_pending";
    next.slots.citaDniPending = dni;
    return buildResult(next, [
      sendText("Enviándote un nuevo código de verificación…"),
      query("validate_user", { numeroDocumento: dni }),
    ]);
  }

  return withNote(buildResult(session, [reauthPrompt()]), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "session_reauth" },
  });
}
