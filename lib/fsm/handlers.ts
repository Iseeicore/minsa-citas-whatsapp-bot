import { handleCita } from "./handlers-cita";
import { handleReclamo } from "./handlers-reclamo";
import { buildResult, omitSlot, query, readReply, sendButtons, sendList, sendText, TERMINAL_STATES } from "./handlers-shared";
import { extractCitaHints } from "./cita-hints";
import { detectCitaRequest, isContinueReply, isGreeting, isReclamoKeyword } from "./menu-shortcuts";
import { OFFERED_SLOT, readOffered } from "./selection-matchers";
import { detectSessionExpiry, resumeStateFor } from "./session-expiry-guard";
import { resolveConfirmation } from "./confirmation-parser";
import { beginCita, buildMenuEffect, RECLAMO_IDENTITY_BUTTONS } from "./flow-entry";
import { handleFirstContact } from "./first-contact";
import {
  evaluateLexicalGuard,
  INSTITUTIONAL_WARNING_TEXT,
  RESPECT_REMINDER_TEXT,
  type LexicalAction,
} from "../security/lexical-guard";
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, Session } from "./types";

const CONTINUE_BUTTON_ID = "continuar_menu";

// Set while the institutional warning's "Continuar" button is the pending
// question, so a typed "ya dale" can answer it. The next message consumes it.
const AWAITING_CONTINUE_SLOT = "awaitingContinue";

// Typing the row's number is the same as tapping the row: no static menu is
// printed again when the intent is that explicit.
const NUMERIC_MENU_CHOICES: Record<string, string> = {
  "1": "agendar_cita",
  "2": "registrar_reclamo",
};

// Free-text states where the lexical guard also runs (Camino A only: warn and
// repeat the question). Structured inputs — DNI, OTP, name, the complaint
// description — are deliberately absent: they are validated by format, and an
// insult inside a complaint is legitimate evidence.
const FREE_TEXT_STATE_PROMPTS: Record<string, string> = {
  cita_awaiting_distrito_ai: 'Cuéntanos en qué distrito buscas atención (ej. "Miraflores").',
  cita_awaiting_departamento: "Indícanos el departamento.",
  cita_awaiting_provincia: "¿En qué provincia?",
  cita_awaiting_distrito: "¿En qué distrito?",
};

// Selection steps: typed text is checked by the guard before any matching, and
// the "repeat the question" is the list the citizen was last shown.
const SELECTION_STATES = new Set([
  "cita_awaiting_distrito_disambiguation",
  "cita_awaiting_ubigeo_select",
  "cita_awaiting_especialidad_select",
  "cita_awaiting_establecimiento_select",
  "cita_awaiting_fecha_select",
  "cita_awaiting_hora_select",
  "cita_awaiting_hora_choice",
]);

function enterMainMenu(preservedSlots: Session["slots"] = {}): HandlerResult {
  return buildResult({ state: "main_menu", slots: preservedSlots, counters: {} }, [buildMenuEffect()]);
}

// Resolves awaiting_flow_start's branch directly into its target state's
// entry prompt, in the same turn as the main_menu selection that produced it.
function handleAwaitingFlowStart(session: Session): HandlerResult {
  const next: Session = {
    state: session.state,
    slots: { ...session.slots },
    counters: { ...session.counters },
  };

  if (next.slots.menuChoice === "registrar_reclamo") {
    next.state = "reclamo_identity_choice";
    return buildResult(next, [sendButtons("¿Tienes tu DNI a la mano?", RECLAMO_IDENTITY_BUTTONS)]);
  }

  if (next.slots.menuChoice === "agendar_cita") {
    next.state = "cita_awaiting_dni";
    return buildResult(next, [sendText("Ingresa tu DNI (8 dígitos).")]);
  }

  // Defensive fallback — should be unreachable since main_menu only accepts
  // the two known row ids before transitioning here.
  return enterMainMenu();
}

// ---- Lexical guard routing -----------------------------------------------

// Applies the guard's verdict for a menu-level message (first contact, the main
// menu, or the first message after a finished cita/reclamo). Exported because
// the webhook's first-contact branch never runs the FSM but must route the
// same way. The abusive text itself is never stored as `initialMessageText`,
// so it can't later leak into an AI call as "context".
export function routeLexicalAction(
  session: Session,
  action: Exclude<LexicalAction, "ALLOW">,
  message?: string,
): HandlerResult {
  const slots = session.state === "main_menu" ? omitSlot(session.slots, AWAITING_CONTINUE_SLOT) : {};

  switch (action) {
    case "DROP_AND_WARN":
      return buildResult({ state: "main_menu", slots: { ...slots, [AWAITING_CONTINUE_SLOT]: true }, counters: {} }, [
        sendButtons(INSTITUTIONAL_WARNING_TEXT, [{ id: CONTINUE_BUTTON_ID, title: "Continuar" }]),
      ]);

    case "CITA_WITH_WARNING": {
      // What they asked for survives the warning: the specialty and district
      // named in the message become the same hints a polite message gets.
      const hints = message ? extractCitaHints(message) : {};
      const withHints = {
        ...slots,
        ...(hints.especialidad ? { citaEspecialidadHintText: hints.especialidad } : {}),
        ...(hints.distrito ? { citaDistritoHintText: hints.distrito } : {}),
      };

      return buildResult({ state: "cita_awaiting_dni", slots: withHints, counters: {} }, [
        sendText(`${RESPECT_REMINDER_TEXT} Continuemos con tu cita: ingresa tu DNI (8 dígitos).`),
      ]);
    }

    case "FORCE_RECLAMO":
      return buildResult({ state: "reclamo_identity_choice", slots, counters: {} }, [
        sendButtons(
          "Lamentamos lo ocurrido. Vamos a registrar tu reclamo en el Libro de Reclamaciones. ¿Tienes tu DNI a la mano?",
          RECLAMO_IDENTITY_BUTTONS,
        ),
      ]);
  }
}

function applyLexicalGuard(session: Session, event: HandleEvent): HandlerResult | undefined {
  if (event.type !== "text" || !event.text) return undefined;

  const isMenuLevel = session.state === "main_menu" || TERMINAL_STATES.has(session.state);
  const midFlowPrompt = FREE_TEXT_STATE_PROMPTS[session.state];
  const isSelection = SELECTION_STATES.has(session.state);
  if (!isMenuLevel && midFlowPrompt === undefined && !isSelection) return undefined;

  const { action } = evaluateLexicalGuard(event.text);
  if (action === "ALLOW") return undefined;

  if (isMenuLevel) return routeLexicalAction(session, action, event.text);

  if (isSelection) {
    const offered = readOffered(session.slots);
    return buildResult(session, [
      sendText(RESPECT_REMINDER_TEXT),
      ...(offered ? [sendList(offered.text, offered.rows)] : []),
    ]);
  }

  return buildResult(session, [sendText(RESPECT_REMINDER_TEXT), sendText(midFlowPrompt)]);
}

function handleMainMenu(pending: Session, event: InboundEvent): HandlerResult {
  const awaitingContinue = pending.slots[AWAITING_CONTINUE_SLOT] === true;
  const session: Session = { ...pending, slots: omitSlot(pending.slots, AWAITING_CONTINUE_SLOT) };

  if (awaitingContinue && event.text && isContinueReply(event.text)) {
    return enterMainMenu(session.slots);
  }

  const numericChoice = event.text ? NUMERIC_MENU_CHOICES[event.text.trim()] : undefined;
  const replyId = numericChoice ?? readReply(event);

  if (replyId === CONTINUE_BUTTON_ID) {
    return enterMainMenu(session.slots);
  }

  if (replyId !== "agendar_cita" && replyId !== "registrar_reclamo") {
    // Deterministic shortcuts first: they cost no AI call, and a bare
    // greeting must not become the "opening message" later used as context.
    if (event.text && isReclamoKeyword(event.text)) {
      return handleAwaitingFlowStart({
        state: "awaiting_flow_start",
        slots: { ...session.slots, menuChoice: "registrar_reclamo" },
        counters: {},
      });
    }

    if (event.text && isGreeting(event.text)) {
      return enterMainMenu(session.slots);
    }

    // Capture the citizen's very first free-text message (only once — not on
    // every subsequent invalid menu tap) so later steps like the Cita
    // district question can use it as context. A message like "quiero una
    // cita en Miraflores" sent before ever touching the menu would otherwise
    // be discarded here with no trace.
    const preservedSlots =
      !session.slots.initialMessageText && event.text
        ? { initialMessageText: event.text }
        : session.slots;

    // A message that already names the cita and what the flow asks for
    // ("quiero una cita en San Borja de odontología") goes straight to the
    // Cita flow: no AI call, so nothing that can fail and bounce them back.
    const cita = event.text ? detectCitaRequest(event.text) : undefined;
    if (cita) return beginCitaFromIntent(preservedSlots, cita);

    // Before just re-showing the menu, see if this free text already
    // expresses a clear intent to book an appointment (e.g. "quiero una
    // cita de odontología") — if so, skip the menu entirely instead of
    // making them tap something they already told us in words.
    if (event.text) {
      const next: Session = { state: "main_menu_intent_pending", slots: preservedSlots, counters: {} };
      return buildResult(next, [
        sendText("Un momento, estamos revisando tu mensaje…"),
        query("analyze_main_menu_intent", { text: event.text }),
      ]);
    }

    return enterMainMenu(preservedSlots);
  }

  const next: Session = {
    state: "awaiting_flow_start",
    slots: { ...session.slots, menuChoice: replyId },
    counters: {},
  };
  return handleAwaitingFlowStart(next);
}

function handleMainMenuIntentPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { intent?: string; especialidad?: string; distrito?: string };

  if (result.intent === "cita") return beginCitaFromIntent(session.slots, result);

  return enterMainMenu(session.slots);
}

// Shared by the deterministic reading and the AI's: the specialty and district
// the citizen already named seed the hints the Cita flow applies on its own.
function beginCitaFromIntent(
  slots: Session["slots"],
  hints: { especialidad?: string; distrito?: string },
): HandlerResult {
  return beginCita(
    slots,
    hints,
    "¡Entendido! Quieres agendar una cita médica. Antes de continuar necesito verificar tu identidad — ingresa tu DNI (8 dígitos).",
  );
}

// ---- Session expiry ---------------------------------------------------------
// Detection lives in session-expiry-guard.ts; this is what happens next. The
// bearer and every reservation-in-progress slot are dropped, but the DNI and
// the choices already made (district, specialty, establishment, date) stay, so
// a citizen who verifies again resumes where they were (citaResumeState, the
// same mechanism as the 401 recovery in handlers-cita.ts).

const REAUTH_YES_ID = "cita_reauth_si";
const REAUTH_NO_ID = "cita_reauth_no";
const TRANSIENT_BOOKING_SLOTS = [
  "citaBearer",
  "citaHorasDia",
  "citaHoraConfirmId",
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

function beginSessionReauth(session: Session): HandlerResult {
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

function handleAwaitingReauth(session: Session, event: InboundEvent): HandlerResult {
  const tapped = event.type === "button" || event.type === "list" ? event.listId : undefined;
  const typed = event.type === "text" ? resolveConfirmation(event.text ?? "") : "UNKNOWN";

  if (tapped === REAUTH_NO_ID || typed === "NO") return enterMainMenu();

  if (tapped === REAUTH_YES_ID || typed === "YES") {
    const dni = session.slots.citaDni;
    const next: Session = { state: "cita_awaiting_dni", slots: { ...session.slots }, counters: { ...session.counters } };

    if (typeof dni !== "string" || dni === "") {
      return buildResult(next, [sendText("Para enviarte un nuevo código, ingresa tu DNI (8 dígitos).")]);
    }

    next.state = "cita_validate_pending";
    next.slots.citaDniPending = dni;
    return buildResult(next, [
      sendText("Enviándote un nuevo código de verificación…"),
      query("validate_user", { numeroDocumento: dni }),
    ]);
  }

  return buildResult(session, [reauthPrompt()]);
}

export function handle(session: Session, event: HandleEvent, now: number = Date.now()): HandlerResult {
  if (session.state === "cita_awaiting_reauth" && event.type !== "query_result") {
    return handleAwaitingReauth(session, event as InboundEvent);
  }

  if (detectSessionExpiry(session, event, now)) return beginSessionReauth(session);

  const guarded = applyLexicalGuard(session, event);
  if (guarded) return guarded;

  if (TERMINAL_STATES.has(session.state) && event.type !== "query_result") {
    // A citizen returning after a finished cita/reclamo is starting over: same
    // treatment as a first-ever message (see first-contact.ts).
    return handleFirstContact(event.type === "text" ? event.text : undefined);
  }

  if (session.state === "main_menu") {
    return handleMainMenu(session, event as InboundEvent);
  }

  if (session.state === "main_menu_intent_pending") {
    return handleMainMenuIntentPending(session, event as QueryResultEvent);
  }

  if (session.state === "awaiting_flow_start") {
    return handleAwaitingFlowStart(session);
  }

  if (session.state.startsWith("reclamo_")) {
    return handleReclamo(session, event);
  }

  if (session.state.startsWith("cita_")) {
    return handleCita(session, event);
  }

  throw new Error(`handle: unknown state "${session.state}"`);
}
