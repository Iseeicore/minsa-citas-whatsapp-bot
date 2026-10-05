import { detectExitIntent } from "@/lib/fsm/parsing/exit-intent";
import { resolveConfirmation } from "@/lib/fsm/parsing/confirmation-parser";
import { normalizeText } from "@/lib/fsm/parsing/text";
import { readOffered } from "@/lib/fsm/parsing/selection-matchers";
import { buildResult, cloneSession, sendButtons, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import { reshowOffered } from "@/lib/fsm/flows/cita/selection";
import { handleRegistrationWait } from "@/lib/fsm/flows/cita/steps/identity";
import { REAUTH_STATE, reauthPrompt } from "@/lib/fsm/session/reauth-prompt";
import type { HandleEvent, HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";

export const EXIT_CONFIRM_STATE = "cita_awaiting_exit_confirm";
export const ABANDONED_STATE = "cita_abandoned";
const RESUME_SLOT = "citaExitResumeState";

const EXIT_YES_ID = "cita_salir_si";
const EXIT_NO_ID = "cita_salir_no";

const EXIT_QUESTION = "Parece que prefieres no continuar con tu cita. Entiendo que pueda ser frustrante. ¿Deseas salir?";
const GOODBYE = "Entendido. Cuando quieras retomar tu cita, escríbenos. ¡Que tengas un buen día! 👋";

const LEAVE_ANSWERS = new Set(["SALIR", "SI SALIR", "QUIERO SALIR"]);
const STAY_ANSWERS = new Set(["CONTINUAR", "SEGUIR", "NO CONTINUAR", "QUIERO CONTINUAR", "QUIERO SEGUIR"]);

const TEXT_PROMPTS: Readonly<Record<string, string>> = {
  cita_awaiting_dni: "Ingresa tu número de documento.",
  cita_awaiting_otp: "Te enviamos un código a tu teléfono registrado. Escríbelo aquí (4-8 dígitos).",
  cita_awaiting_distrito_ai: "Cuéntanos el nombre del distrito.",
  cita_awaiting_departamento: "Indícanos el departamento.",
  cita_awaiting_provincia: "Indícanos la provincia.",
  cita_awaiting_distrito: "Indícanos el distrito.",
};

const LIST_STATES = new Set([
  "cita_awaiting_distrito_disambiguation",
  "cita_awaiting_ubigeo_select",
  "cita_awaiting_especialidad_select",
  "cita_awaiting_establecimiento_select",
  "cita_awaiting_fecha_select",
  "cita_awaiting_hora_select",
]);

const REGISTRATION_WAIT_STATE = "cita_registration_wait";

const canLeaveFrom = (state: string): boolean =>
  state in TEXT_PROMPTS || LIST_STATES.has(state) || state === REGISTRATION_WAIT_STATE;

const exitButtons = () =>
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

export function offerExitIfRequested(session: Session, event: HandleEvent): HandlerResult | undefined {
  if (event.type !== "text" || !event.text || !canLeaveFrom(session.state)) return undefined;
  return detectExitIntent(event.text) ? askToLeave(session, "local") : undefined;
}

function resume(session: Session, event: InboundEvent): HandlerResult {
  const restored = cloneSession(session);
  restored.state = String(session.slots[RESUME_SLOT] ?? "cita_awaiting_dni");
  delete restored.slots[RESUME_SLOT];

  if (restored.state === REAUTH_STATE) return buildResult(restored, [reauthPrompt()]);
  const prompt = TEXT_PROMPTS[restored.state];
  if (prompt) return buildResult(restored, [sendText(prompt)]);
  if (restored.state === REGISTRATION_WAIT_STATE) return handleRegistrationWait(restored, { ...event, type: "text", text: "" });
  return reshowOffered(restored, readOffered(restored.slots));
}

export function handleExitConfirm(session: Session, event: InboundEvent): HandlerResult {
  const tapped = event.type === "button" || event.type === "list" ? event.listId : undefined;
  const typed = event.type === "text" ? (event.text ?? "") : "";
  const normalized = normalizeText(typed);
  const answer =
    LEAVE_ANSWERS.has(normalized) || (typed && detectExitIntent(typed))
      ? "YES"
      : STAY_ANSWERS.has(normalized)
        ? "NO"
        : resolveConfirmation(typed);

  if (tapped === EXIT_YES_ID || answer === "YES") {
    return withNote(buildResult({ state: ABANDONED_STATE, slots: {}, counters: {} }, [sendText(GOODBYE)]), {
      kind: "cita_closed",
      detail: { reason: "abandoned", from: String(session.slots[RESUME_SLOT] ?? "") },
    });
  }

  if (tapped === EXIT_NO_ID || answer === "NO") return resume(session, event);

  return withNote(buildResult(session, [exitButtons()]), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "exit_confirm" },
  });
}
