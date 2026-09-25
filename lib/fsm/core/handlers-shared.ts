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
  "cita_national_redirect",
  "cita_no_coverage_closed",
  "cita_declined_closed",
  "emergency_closed",
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

export function sendCtaUrl(text: string, buttonText: string, url: string): SendEffect {
  return { kind: "send_cta_url", text, buttonText, url };
}

export function query(kind: QueryEffectKind, payload: Record<string, unknown>): QueryEffect {
  return { kind, payload };
}

export function isQueryEffect(effect: SendEffect | QueryEffect): effect is QueryEffect {
  return "payload" in effect;
}

// Puts a decision or a friction point on the result, for the executor to log.
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

// A finished flow has no further use for MINSA's token, and the session stays
// stored until the citizen writes again — so it must not be left sitting there.
function dropBearerWhenClosed(session: Session): Session {
  if (!TERMINAL_STATES.has(session.state) || !("citaBearer" in session.slots)) return session;

  return { ...session, slots: omitSlot(session.slots, "citaBearer") };
}

export function omitSlot(slots: Session["slots"], name: string): Session["slots"] {
  return Object.fromEntries(Object.entries(slots).filter(([key]) => key !== name));
}

// WhatsApp's interactive list rows have hard limits — Meta rejects the whole
// message (silently, from the citizen's side: sendAndRecordEffect logs it
// server-side and never throws) if a title exceeds 24 characters, a
// description exceeds 72, or there are more than 10 rows total. District and
// establishment names routinely blow past 24 chars on their own (e.g. "San
// Juan de Lurigancho"), so every row built from real-world names goes
// through this truncation as cheap insurance.
export const WHATSAPP_ROW_TITLE_MAX = 24;
export const WHATSAPP_ROW_DESCRIPTION_MAX = 72;
export const WHATSAPP_LIST_MAX_ROWS = 10;

export function truncateForRow(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

// Mutates `next` (always a fresh clone at the call sites). Every list is sent
// through this so the rows the citizen can pick from are remembered
// (Session.slots only holds scalars, hence a JSON string) for whatever step
// reads them back next turn.
export function offerList(next: Session, text: string, rows: ListRow[]): SendEffect {
  next.slots[OFFERED_SLOT] = serializeOffered({ text, rows });
  return sendList(text, rows);
}

// A citizen who already answered "sí"/"claro"/"ese" to a preceding question —
// shared by more than one step that needs to tell "yes, no district named"
// apart from "here is a fresh answer".
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
