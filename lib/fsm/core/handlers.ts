import { handleCita } from "@/lib/fsm/flows/cita/handlers-cita";
import { handleReclamo } from "@/lib/fsm/flows/reclamo/handlers-reclamo";
import { TERMINAL_STATES, withNote } from "@/lib/fsm/core/handlers-shared";
import { detectSessionExpiry } from "@/lib/fsm/session/session-expiry-guard";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { emergencyCut, isEmergencyTurn } from "@/lib/fsm/flows/emergency/emergency";
import type {
  HandleEvent,
  HandlerResult,
  InboundEvent,
  QueryResultEvent,
  Session,
} from "@/lib/fsm/core/types";
import {
  handleAwaitingFlowStart,
  handleMainMenu,
  handleMainMenuIntentPending,
} from "@/lib/fsm/routing/main-menu";
import { applyLexicalGuard } from "@/lib/fsm/routing/lexical-guard-routing";
import { beginSessionReauth, handleAwaitingReauth } from "@/lib/fsm/session/session-reauth";

export function handle(session: Session, event: HandleEvent, now: number = Date.now()): HandlerResult {
  if (event.type === "text" && event.text && isEmergencyTurn(session.state, event.text)) {
    return emergencyCut(session.state);
  }
  return handleTurn(session, event, now);
}

function handleTurn(session: Session, event: HandleEvent, now: number): HandlerResult {
  if (session.state === "cita_awaiting_reauth" && event.type !== "query_result") {
    return handleAwaitingReauth(session, event as InboundEvent);
  }

  const expiry = detectSessionExpiry(session, event, now);
  if (expiry) {
    return withNote(beginSessionReauth(session), {
      kind: "session_expired",
      level: "warn",
      detail: {
        reason: expiry === "idle" ? "IDLE_TIMEOUT" : "JWT_EXPIRED",
        state: session.state,
        ...(session.updatedAt ? { idleMs: now - session.updatedAt.getTime() } : {}),
      },
    });
  }

  const guarded = applyLexicalGuard(session, event);
  if (guarded) return guarded;

  if (TERMINAL_STATES.has(session.state) && event.type !== "query_result") {
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
