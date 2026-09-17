import { handleCita } from "./handlers-cita";
import { handleReclamo } from "./handlers-reclamo";
import { buildResult, readReply, sendButtons, sendList, sendText, TERMINAL_STATES } from "./handlers-shared";
import { buildWelcomeEffect } from "./welcome";
import type { HandleEvent, HandlerResult, InboundEvent, Session } from "./types";

const MENU_ROWS = [
  { id: "agendar_cita", title: "Agendar una cita médica" },
  { id: "registrar_reclamo", title: "Registrar un reclamo" },
];

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
    return buildResult(next, [
      sendButtons("¿Tienes tu DNI a la mano?", [
        { id: "reclamo_con_dni", title: "Sí, tengo DNI" },
        { id: "reclamo_sin_dni", title: "No tengo DNI" },
      ]),
    ]);
  }

  if (next.slots.menuChoice === "agendar_cita") {
    next.state = "cita_awaiting_dni";
    return buildResult(next, [sendText("Ingresa tu DNI (8 dígitos).")]);
  }

  // Defensive fallback — should be unreachable since main_menu only accepts
  // the two known row ids before transitioning here.
  return enterMainMenu();
}

function handleMainMenu(session: Session, event: InboundEvent): HandlerResult {
  const replyId = readReply(event);

  if (replyId !== "agendar_cita" && replyId !== "registrar_reclamo") {
    // Capture the citizen's very first free-text message (only once — not on
    // every subsequent invalid menu tap) so later steps like the Cita
    // district question can use it as context. A message like "quiero una
    // cita en Miraflores" sent before ever touching the menu would otherwise
    // be discarded here with no trace.
    const preservedSlots =
      !session.slots.initialMessageText && event.text
        ? { initialMessageText: event.text }
        : session.slots;
    return enterMainMenu(preservedSlots);
  }

  const next: Session = {
    state: "awaiting_flow_start",
    slots: { ...session.slots, menuChoice: replyId },
    counters: {},
  };
  return handleAwaitingFlowStart(next);
}

export function handle(session: Session, event: HandleEvent): HandlerResult {
  if (TERMINAL_STATES.has(session.state) && event.type !== "query_result") {
    return enterMainMenuAfterTerminal();
  }

  if (session.state === "main_menu") {
    return handleMainMenu(session, event as InboundEvent);
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
