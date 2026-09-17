import { handleCita } from "./handlers-cita";
import { handleReclamo } from "./handlers-reclamo";
import { buildResult, readReply, sendButtons, sendList, sendText, TERMINAL_STATES } from "./handlers-shared";
import type { HandleEvent, HandlerResult, InboundEvent, Session } from "./types";

const MENU_ROWS = [
  { id: "agendar_cita", title: "Agendar una cita médica" },
  { id: "registrar_reclamo", title: "Registrar un reclamo" },
];

function enterMainMenu(): HandlerResult {
  return buildResult({ state: "main_menu", slots: {}, counters: {} }, [
    sendList("¿En qué podemos ayudarte hoy?", MENU_ROWS),
  ]);
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

function handleMainMenu(event: InboundEvent): HandlerResult {
  const replyId = readReply(event);

  if (replyId !== "agendar_cita" && replyId !== "registrar_reclamo") {
    return enterMainMenu();
  }

  const next: Session = { state: "awaiting_flow_start", slots: { menuChoice: replyId }, counters: {} };
  return handleAwaitingFlowStart(next);
}

export function handle(session: Session, event: HandleEvent): HandlerResult {
  if (TERMINAL_STATES.has(session.state) && event.type !== "query_result") {
    return enterMainMenu();
  }

  if (session.state === "main_menu") {
    return handleMainMenu(event as InboundEvent);
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
