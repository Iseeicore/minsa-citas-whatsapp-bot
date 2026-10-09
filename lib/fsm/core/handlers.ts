import { handleCita } from "@/lib/fsm/flows/cita/handlers-cita";
import { handleIncidencia } from "@/lib/fsm/flows/incidencia/handlers-incidencia";
import { TERMINAL_STATES, withNote } from "@/lib/fsm/core/handlers-shared";
import { detectSessionExpiry } from "@/lib/fsm/session/session-expiry-guard";
import { SessionExpiryReason } from "@/lib/enums/session-expiry-reason";
import { SessionChannel } from "@/lib/enums/session-channel";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
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
import { offerExitIfRequested } from "@/lib/fsm/flows/cita/steps/exit/exit";
import { SessionState } from "@/lib/enums/session-state";
import { textoDeLaPersona } from "@/lib/fsm/parsing/text/inicio-incidencia";

export function handle(session: Session, event: HandleEvent, now: number = Date.now()): HandlerResult {
  if (event.type === InboundEventType.TEXT && event.text && isEmergencyTurn(session.state, textoDeLaPersona(event.text))) {
    return emergencyCut(session.state);
  }
  return handleTurn(session, event, now);
}

function handleTurn(session: Session, event: HandleEvent, now: number): HandlerResult {
  if (session.state === SessionState.CITA_AWAITING_REAUTH && event.type !== "query_result") {
    return handleAwaitingReauth(session, event as InboundEvent);
  }

  const expiry = detectSessionExpiry(session, event, now);
  if (expiry) {
    return withNote(beginSessionReauth(session), {
      kind: "session_expired",
      level: "warn",
      detail: {
        reason: expiry === SessionExpiryReason.IDLE ? "IDLE_TIMEOUT" : "JWT_EXPIRED",
        state: session.state,
        ...(session.updatedAt ? { idleMs: now - session.updatedAt.getTime() } : {}),
      },
    });
  }

  const leaving = offerExitIfRequested(session, event);
  if (leaving) return leaving;

  const guarded = applyLexicalGuard(session, event);
  if (guarded) return guarded;

  if (TERMINAL_STATES.has(session.state) && event.type !== "query_result") {
    return handleFirstContact(
      event.type === InboundEventType.TEXT ? event.text : undefined,
      session.channel ?? SessionChannel.WHATSAPP,
    );
  }

  if (session.state === SessionState.MAIN_MENU) {
    return handleMainMenu(session, event as InboundEvent);
  }

  if (session.state === SessionState.MAIN_MENU_INTENT_PENDING) {
    return handleMainMenuIntentPending(session, event as QueryResultEvent);
  }

  if (session.state === SessionState.AWAITING_FLOW_START) {
    return handleAwaitingFlowStart(session);
  }

  if (session.state.startsWith("incidencia_")) {
    return handleIncidencia(session, event);
  }

  if (session.state.startsWith("cita_")) {
    return handleCita(session, event);
  }

  throw new Error(`handle: unknown state "${session.state}"`);
}
