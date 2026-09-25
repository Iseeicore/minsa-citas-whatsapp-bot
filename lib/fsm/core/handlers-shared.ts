import type { TurnNote } from "@/lib/observability/types";
import { OFFERED_SLOT, serializeOffered } from "@/lib/fsm/parsing/selection-matchers";
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
} from "@/lib/fsm/core/types";

export const TERMINAL_STATES = new Set([
  "reclamo_rejected",
  "reclamo_confirmed",
  "reclamo_failed",
  "cita_registration_rejected",
  "cita_otp_locked",
  "cita_booked",
  "cita_booking_duplicate",
  "cita_booking_rejected",
  "cita_national_redirect",
  "cita_no_coverage_closed",
  "cita_declined_closed",
  "emergency_closed",
]);

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

export function sendCtaUrl(text: string, buttonText: string, url: string): SendEffect {
  return { kind: "send_cta_url", text, buttonText, url };
}

export function query(kind: QueryEffectKind, payload: Record<string, unknown>): QueryEffect {
  return { kind, payload };
}

export function isQueryEffect(effect: SendEffect | QueryEffect): effect is QueryEffect {
  return "payload" in effect;
}

export function withNote(result: HandlerResult, note: TurnNote): HandlerResult {
  return { ...result, notes: [...(result.notes ?? []), note] };
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

  return { session: dropBearerWhenClosed(session), effects, outcome };
}

function dropBearerWhenClosed(session: Session): Session {
  if (!TERMINAL_STATES.has(session.state) || !("citaBearer" in session.slots)) return session;

  return { ...session, slots: omitSlot(session.slots, "citaBearer") };
}

export function omitSlot(slots: Session["slots"], name: string): Session["slots"] {
  return Object.fromEntries(Object.entries(slots).filter(([key]) => key !== name));
}

export const WHATSAPP_ROW_TITLE_MAX = 24;
export const WHATSAPP_ROW_DESCRIPTION_MAX = 72;
export const WHATSAPP_LIST_MAX_ROWS = 10;

export function truncateForRow(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

/** WhatsApp rechaza la lista completa si una fila supera 24 caracteres de título, 72 de descripción o hay más de 10 filas. */
export function offerList(next: Session, text: string, rows: ListRow[]): SendEffect {
  next.slots[OFFERED_SLOT] = serializeOffered({ text, rows });
  return sendList(text, rows);
}

const AFFIRMATIVE_REPLIES = new Set([
  "si",
  "sí",
  "s",
  "yes",
  "y",
  "ese",
  "esa",
  "eso",
  "correcto",
  "exacto",
  "confirmo",
  "afirmativo",
  "claro",
  "asi es",
  "así es",
]);

export function isAffirmativeReply(text: string): boolean {
  return AFFIRMATIVE_REPLIES.has(text.trim().toLowerCase());
}
