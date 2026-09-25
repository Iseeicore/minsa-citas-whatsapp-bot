import { buildResult, query, sendButtons, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import { OFFERED_SLOT } from "@/lib/fsm/parsing/selection-matchers";
import { resumeStateFor } from "@/lib/fsm/session/session-expiry-guard";
import { resolveConfirmation } from "@/lib/fsm/parsing/confirmation-parser";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { enterMainMenu } from "@/lib/fsm/routing/main-menu";

const REAUTH_YES_ID = "cita_reauth_si";

const REAUTH_NO_ID = "cita_reauth_no";

const TRANSIENT_BOOKING_SLOTS = [
  "citaBearer",
  "citaHorasDia",
  "citaHoraConfirmId",
  "citaHoraConfirmOnly",
  "citaHoraChoiceA",
  "citaHoraChoiceB",
  OFFERED_SLOT,
];

const REAUTH_PROMPT_TEXT =
  "⏳ Tu sesión ha expirado por inactividad. Por tu seguridad, necesitamos confirmar nuevamente tu identidad para continuar con tu cita. ¿Deseas solicitar un nuevo código de verificación?\n\n[1] Sí, enviar código\n[2] Cancelar y volver al menú";

const reauthPrompt = () =>
  sendButtons(REAUTH_PROMPT_TEXT, [
    { id: REAUTH_YES_ID, title: "Sí, enviar código" },
    { id: REAUTH_NO_ID, title: "Cancelar" },
  ]);

export function beginSessionReauth(session: Session): HandlerResult {
  const next: Session = {
    state: "cita_awaiting_reauth",
    slots: { ...session.slots },
    counters: { ...session.counters },
  };
  for (const slot of TRANSIENT_BOOKING_SLOTS) delete next.slots[slot];
  delete next.counters.citaHoraPage;

  const resumeState = resumeStateFor(session.state);
  if (resumeState) next.slots.citaResumeState = resumeState;

  return buildResult(next, [reauthPrompt()]);
}

export function handleAwaitingReauth(session: Session, event: InboundEvent): HandlerResult {
  const tapped = event.type === "button" || event.type === "list" ? event.listId : undefined;
  const typed = event.type === "text" ? resolveConfirmation(event.text ?? "") : "UNKNOWN";

  if (tapped === REAUTH_NO_ID || typed === "NO") return enterMainMenu();

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
