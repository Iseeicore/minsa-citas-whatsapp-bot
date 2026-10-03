import type { TurnNote } from "@/lib/observability/types";
import { SendType } from "@/lib/enums/send-type";
import { HandlerOutcome } from "@/lib/enums/handler-outcome";
import { ListPageButtonId } from "@/lib/enums/list-page-button-id";
import { serializeOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import type {
  ButtonOption,
  HandlerResult,
  InboundEvent,
  ListRow,
  QueryEffect,
  QueryEffectKind,
  SendEffect,
  Session,
} from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";

export const TERMINAL_STATES: ReadonlySet<string> = new Set<Session["state"]>([
  SessionState.RECLAMO_REJECTED,
  SessionState.RECLAMO_CONFIRMED,
  SessionState.RECLAMO_FAILED,
  SessionState.CITA_REGISTRATION_REJECTED,
  SessionState.CITA_OTP_LOCKED,
  SessionState.CITA_BOOKED,
  SessionState.CITA_BOOKING_DUPLICATE,
  SessionState.CITA_BOOKING_REJECTED,
  SessionState.CITA_NATIONAL_REDIRECT,
  SessionState.CITA_NO_COVERAGE_CLOSED,
  SessionState.CITA_DECLINED_CLOSED,
  SessionState.CITA_ABANDONED,
  SessionState.EMERGENCY_CLOSED,
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
  return { kind: SendType.TEXT, text };
}

export function sendList(text: string, rows: ListRow[]): SendEffect {
  return { kind: SendType.INTERACTIVE_LIST, text, rows };
}

export function sendButtons(text: string, buttons: ButtonOption[]): SendEffect {
  return { kind: SendType.BUTTONS, text, buttons };
}

export function sendCtaUrl(text: string, buttonText: string, url: string): SendEffect {
  return { kind: SendType.CTA_URL, text, buttonText, url };
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
    ? HandlerOutcome.AWAITING_QUERY
    : TERMINAL_STATES.has(session.state)
      ? HandlerOutcome.CLOSED
      : HandlerOutcome.CONTINUE;

  return { session: dropBearerWhenClosed(session), effects, outcome };
}

function dropBearerWhenClosed(session: Session): Session {
  if (!TERMINAL_STATES.has(session.state) || !(SlotKey.CITA_BEARER in session.slots)) return session;

  return { ...session, slots: omitSlot(session.slots, SlotKey.CITA_BEARER) };
}

export function omitSlot(slots: Session["slots"], name: SlotKey): Session["slots"] {
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
  next.slots[SlotKey.CITA_OFFERED] = serializeOffered({ text, rows });
  return sendList(text, rows);
}

export const LIST_PAGE_NEXT_ID = ListPageButtonId.NEXT;
export const LIST_PAGE_PREV_ID = ListPageButtonId.PREV;

export function pageCount(rowCount: number): number {
  return Math.max(1, Math.ceil(rowCount / WHATSAPP_LIST_MAX_ROWS));
}

export function pageEffects(text: string, rows: ListRow[], page: number): SendEffect[] {
  if (rows.length <= WHATSAPP_LIST_MAX_ROWS) return [sendList(text, rows)];

  const current = Math.min(Math.max(page, 0), pageCount(rows.length) - 1);
  const start = current * WHATSAPP_LIST_MAX_ROWS;
  const visible = rows.slice(start, start + WHATSAPP_LIST_MAX_ROWS);
  const buttons: ButtonOption[] = [];
  if (current > 0) buttons.push({ id: LIST_PAGE_PREV_ID, title: "Anteriores" });
  if (start + visible.length < rows.length) buttons.push({ id: LIST_PAGE_NEXT_ID, title: "Ver más opciones" });

  return [
    sendList(text, visible),
    sendButtons(`Mostrando ${start + 1} a ${start + visible.length} de ${rows.length} opciones.`, buttons),
  ];
}

/** Guarda la lista completa (para reconocer cualquier fila escrita) y muestra solo la página actual de 10 filas. */
export function offerPagedList(next: Session, text: string, rows: ListRow[]): SendEffect[] {
  next.slots[SlotKey.CITA_OFFERED] = serializeOffered({ text, rows });
  delete next.counters[CounterKey.CITA_LIST_PAGE];
  return pageEffects(text, rows, 0);
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
