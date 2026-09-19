import { handleCita } from "./handlers-cita";
import { handleReclamo } from "./handlers-reclamo";
import { buildResult, query, readReply, sendButtons, sendList, sendText, TERMINAL_STATES } from "./handlers-shared";
import { isGreeting, isReclamoKeyword } from "./menu-shortcuts";
import { readOffered } from "./selection-matchers";
import { buildWelcomeEffect } from "./welcome";
import {
  evaluateLexicalGuard,
  INSTITUTIONAL_WARNING_TEXT,
  RESPECT_REMINDER_TEXT,
  type LexicalAction,
} from "../security/lexical-guard";
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, Session } from "./types";

const MENU_ROWS = [
  { id: "agendar_cita", title: "Agendar una cita médica" },
  { id: "registrar_reclamo", title: "Registrar un reclamo" },
];

const CONTINUE_BUTTON_ID = "continuar_menu";

const RECLAMO_IDENTITY_BUTTONS = [
  { id: "reclamo_con_dni", title: "Sí, tengo DNI" },
  { id: "reclamo_sin_dni", title: "No tengo DNI" },
];

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
]);

function enterMainMenu(preservedSlots: Session["slots"] = {}): HandlerResult {
  return buildResult({ state: "main_menu", slots: preservedSlots, counters: {} }, [
    sendList("¿En qué podemos ayudarte hoy?", MENU_ROWS),
  ]);
}

// Re-sends the branded welcome ahead of the menu when a citizen returns
// after their previous cita/reclamo reached a terminal state — from their
// perspective this is a fresh interaction, not a mid-flow reset, so it gets
// the same welcome first-contact gets. Skips the separate "¿Prefieres
// seguir por aquí mismo?" follow-up the true first-contact flow sends
// (app/webhook/whatsapp/route.ts) — redundant here since they're already
// typing back into the bot.
function enterMainMenuAfterTerminal(): HandlerResult {
  const result = enterMainMenu();
  return { ...result, effects: [buildWelcomeEffect(), ...result.effects] };
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
): HandlerResult {
  const slots = session.state === "main_menu" ? session.slots : {};

  switch (action) {
    case "DROP_AND_WARN":
      return buildResult({ state: "main_menu", slots, counters: {} }, [
        sendButtons(INSTITUTIONAL_WARNING_TEXT, [{ id: CONTINUE_BUTTON_ID, title: "Continuar" }]),
      ]);

    case "CITA_WITH_WARNING":
      return buildResult({ state: "cita_awaiting_dni", slots, counters: {} }, [
        sendText(`${RESPECT_REMINDER_TEXT} Continuemos con tu cita: ingresa tu DNI (8 dígitos).`),
      ]);

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

  if (isMenuLevel) return routeLexicalAction(session, action);

  if (isSelection) {
    const offered = readOffered(session.slots);
    return buildResult(session, [
      sendText(RESPECT_REMINDER_TEXT),
      ...(offered ? [sendList(offered.text, offered.rows)] : []),
    ]);
  }

  return buildResult(session, [sendText(RESPECT_REMINDER_TEXT), sendText(midFlowPrompt)]);
}

function handleMainMenu(session: Session, event: InboundEvent): HandlerResult {
  const replyId = readReply(event);

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

  if (result.intent === "cita") {
    const next: Session = {
      state: "cita_awaiting_dni",
      slots: {
        ...session.slots,
        ...(result.especialidad ? { citaEspecialidadHintText: result.especialidad } : {}),
        ...(result.distrito ? { citaDistritoHintText: result.distrito } : {}),
      },
      counters: {},
    };
    return buildResult(next, [
      sendText(
        "¡Entendido! Quieres agendar una cita médica. Antes de continuar necesito verificar tu identidad — ingresa tu DNI (8 dígitos).",
      ),
    ]);
  }

  return enterMainMenu(session.slots);
}

export function handle(session: Session, event: HandleEvent): HandlerResult {
  const guarded = applyLexicalGuard(session, event);
  if (guarded) return guarded;

  if (TERMINAL_STATES.has(session.state) && event.type !== "query_result") {
    return enterMainMenuAfterTerminal();
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
