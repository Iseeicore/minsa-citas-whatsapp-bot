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
  SendInteractiveListEffect,
  Session,
} from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import { FALLBACK_TEXT, LIST_PAGE_PREV_BUTTON_TEXT, LIST_PAGE_NEXT_BUTTON_TEXT, listPageSummaryText } from "@/lib/constants/textos/comunes";
import { AFFIRMATIVE_REPLIES } from "@/lib/constants/palabras-clave";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { WHATSAPP_LIST_MAX_ROWS } from "@/lib/constants/limits/whatsapp";
import { uniqueBy } from "@/lib/utils/array-values";
import { channelOf } from "@/lib/fsm/core/channel";
import { SessionChannel } from "@/lib/enums/session-channel";
import { WHATSAPP_CONSULTA_REFERENCIAS_PAGE_SIZE, WHATSAPP_REFERENCE_LIST_PAGE_SIZE } from "@/lib/constants/limits/whatsapp-reference";
import { AppointmentMode } from "@/lib/enums/appointment-mode";

export const TERMINAL_STATES: ReadonlySet<string> = new Set<Session["state"]>([
  SessionState.INCIDENCIA_CONFIRMED,
  SessionState.INCIDENCIA_CANCELLED,
  SessionState.INCIDENCIA_FAILED,
  SessionState.CONSULTA_COMPLETED,
  SessionState.CONSULTA_FAILED,
  SessionState.REFERENCIA_CLOSED,
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

export function readTappedId(event: InboundEvent): string | undefined {
  return event.type === InboundEventType.BUTTON || event.type === InboundEventType.LIST ? event.listId : undefined;
}

export function readTypedText(event: InboundEvent): string {
  return event.type === InboundEventType.TEXT ? (event.text ?? "") : "";
}

export function readTrimmedText(event: InboundEvent): string {
  return (event.text ?? "").trim();
}

export function cloneSession(session: Session): Session {
  return {
    state: session.state,
    slots: { ...session.slots },
    counters: { ...session.counters },
    ...(session.channel ? { channel: session.channel } : {}),
  };
}

export function sendText(text: string): SendEffect {
  return { kind: SendType.TEXT, text };
}

export function withLeadingText(result: HandlerResult, text: string): HandlerResult {
  return { ...result, effects: [sendText(text), ...result.effects] };
}

export function withRejectionNotice(result: HandlerResult, text: string = FALLBACK_TEXT): HandlerResult {
  return withLeadingText(result, text);
}

export function sendList(text: string, rows: ListRow[]): SendInteractiveListEffect {
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

export function buildResult(session: Session, effects: (SendEffect | QueryEffect)[]): HandlerResult {
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

export function truncateForRow(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

const uniqueRows = (rows: ListRow[]): ListRow[] => uniqueBy(rows, (row) => row.id);

export function offerList(next: Session, text: string, rows: ListRow[]): SendEffect {
  const offered = uniqueRows(rows);
  next.slots[SlotKey.CITA_OFFERED] = serializeOffered({ text, rows: offered });
  return sendList(text, offered);
}

export function isConsultaReferenciasList(session: Session): boolean {
  return (
    session.state === SessionState.CITA_AWAITING_REFERENCIA_SELECT &&
    session.slots[SlotKey.CITA_APPOINTMENT_MODE] !== AppointmentMode.REFERENCE
  );
}

export function listPageSize(session?: Session): number {
  const reference =
    session?.state === SessionState.CITA_AWAITING_REFERENCIA_SELECT || !!session?.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID];
  if (!session || channelOf(session) !== SessionChannel.WHATSAPP || !reference) return WHATSAPP_LIST_MAX_ROWS;
  return isConsultaReferenciasList(session) ? WHATSAPP_CONSULTA_REFERENCIAS_PAGE_SIZE : WHATSAPP_REFERENCE_LIST_PAGE_SIZE;
}

export function pageCount(rowCount: number, session?: Session): number {
  return Math.max(1, Math.ceil(rowCount / listPageSize(session)));
}

export function pageEffects(text: string, rows: ListRow[], page: number, session?: Session): SendEffect[] {
  const size = listPageSize(session);
  if (rows.length <= size) return [sendList(text, rows)];

  const current = Math.min(Math.max(page, 0), pageCount(rows.length, session) - 1);
  const start = current * size;
  const visible = rows.slice(start, start + size);
  const buttons: ButtonOption[] = [];
  if (current > 0) buttons.push({ id: ListPageButtonId.PREV, title: LIST_PAGE_PREV_BUTTON_TEXT });
  if (start + visible.length < rows.length) buttons.push({ id: ListPageButtonId.NEXT, title: LIST_PAGE_NEXT_BUTTON_TEXT });

  const list = sendList(text, visible);
  if (size < WHATSAPP_LIST_MAX_ROWS) return [{ ...list, actions: buttons }];
  return [list, sendButtons(listPageSummaryText(start + 1, start + visible.length, rows.length), buttons)];
}

export function offerPagedList(next: Session, text: string, rows: ListRow[]): SendEffect[] {
  const offered = uniqueRows(rows);
  next.slots[SlotKey.CITA_OFFERED] = serializeOffered({ text, rows: offered });
  delete next.counters[CounterKey.CITA_LIST_PAGE];
  return pageEffects(text, offered, 0, next);
}

export function isAffirmativeReply(text: string): boolean {
  return AFFIRMATIVE_REPLIES.has(text.trim().toLowerCase());
}
