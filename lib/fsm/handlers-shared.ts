import type {
  ButtonOption,
  HandlerOutcome,
  HandlerResult,
  InboundEvent,
  ListRow,
  QueryEffect,
  QueryEffectKind,
  SendEffect,
  Session,
} from "./types";

// Every terminal state — closedFlowHandler resets any of these back to
// main_menu on the next inbound message from the citizen.
export const TERMINAL_STATES = new Set([
  "reclamo_rejected",
  "reclamo_confirmed",
  "reclamo_failed",
  "cita_registration_rejected",
  "cita_otp_locked",
  "cita_booked",
  "cita_booking_duplicate",
  "cita_booking_rejected",
]);

// A list/button reply carries its selected id in `listId`; a citizen can
// also just type the id as free text and it should match the same way.
export function readReply(event: InboundEvent): string | undefined {
  return event.listId ?? event.text;
}

export function cloneSession(session: Session): Session {
  return {
    state: session.state,
    slots: { ...session.slots },
    counters: { ...session.counters },
  };
}

export function sendText(text: string): SendEffect {
  return { kind: "send_text", text };
}

export function sendList(text: string, rows: ListRow[]): SendEffect {
  return { kind: "send_interactive_list", text, rows };
}

export function sendButtons(text: string, buttons: ButtonOption[]): SendEffect {
  return { kind: "send_buttons", text, buttons };
}

export function query(kind: QueryEffectKind, payload: Record<string, unknown>): QueryEffect {
  return { kind, payload };
}

export function isQueryEffect(effect: SendEffect | QueryEffect): effect is QueryEffect {
  return "payload" in effect;
}

export function buildResult(
  session: Session,
  effects: (SendEffect | QueryEffect)[],
): HandlerResult {
  const outcome: HandlerOutcome = effects.some(isQueryEffect)
    ? "awaiting_query"
    : TERMINAL_STATES.has(session.state)
      ? "closed"
      : "continue";

  return { session, effects, outcome };
}
