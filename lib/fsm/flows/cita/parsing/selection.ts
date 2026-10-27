import {
  buildResult,
  cloneSession,
  offerPagedList,
  pageCount,
  pageEffects,
  listPageSize,
  sendText,
  readTrimmedText,
} from "@/lib/fsm/core/handlers-shared";
import {
  matchSelection,
  readOffered,
  type OfferedList,
  type OfferedRow,
  type SelectionMatch,
} from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SELECTION_REJECTION_TEXT, NARROWED_LIST_TEXT } from "@/lib/constants/textos/comunes";
import { ListPageButtonId } from "@/lib/enums/list-page-button-id";
import { MatchKind } from "@/lib/enums/match-kind";
import { HoraPageButtonId } from "@/lib/enums/hora-page-button-id";
import { SessionState } from "@/lib/enums/session-state";
import { REFERENCE_PAGE_ANSWERS } from "@/lib/constants/palabras-clave";
import { OPTION_NUMBER, DIGITS_ONLY } from "@/lib/constants/regex/selection";
import { WHATSAPP_LIST_MAX_ROWS } from "@/lib/constants/limits/whatsapp";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { unpackHoraSlots } from "@/lib/fsm/parsing/date/time-parser";

export function clearOffered(session: Session): Session {
  const next = cloneSession(session);
  delete next.slots[SlotKey.CITA_OFFERED];
  delete next.slots[SlotKey.CITA_OFFERED_NAMES];
  delete next.counters[CounterKey.CITA_LIST_PAGE];
  return next;
}

export function reshowOffered(
  session: Session,
  offered: OfferedList | undefined,
  message: string = SELECTION_REJECTION_TEXT,
): HandlerResult {
  const effects: SendEffect[] = [sendText(message)];
  if (offered) effects.push(...pageEffects(offered.text, offered.rows, session.counters[CounterKey.CITA_LIST_PAGE] ?? 0, session));
  return buildResult(session, effects);
}

function narrowOffered(session: Session, rows: OfferedRow[]): HandlerResult {
  const next = cloneSession(session);
  return buildResult(next, offerPagedList(next, NARROWED_LIST_TEXT, rows));
}

function turnPage(session: Session, offered: OfferedList, id: string): HandlerResult {
  const next = cloneSession(session);
  const current = next.counters[CounterKey.CITA_LIST_PAGE] ?? 0;
  const target = id === ListPageButtonId.NEXT ? current + 1 : current - 1;
  const page = Math.min(Math.max(target, 0), pageCount(offered.rows.length, next) - 1);
  if (page === 0) delete next.counters[CounterKey.CITA_LIST_PAGE];
  else next.counters[CounterKey.CITA_LIST_PAGE] = page;
  return buildResult(next, pageEffects(offered.text, offered.rows, page, next));
}

export type CustomMatch = SelectionMatch | { kind: MatchKind.NOTICE; text: string } | { kind: MatchKind.HANDLED; result: HandlerResult };

type SelectionOptions = {
  customMatch?: (typed: string, rows: OfferedRow[]) => CustomMatch | undefined;
  includeDescription?: boolean;
  passthroughIds?: string[];
  onNoMatchText?: (typed: string) => HandlerResult | undefined;
};

type SelectionOutcome = { replyId: string; typed?: string } | { result: HandlerResult };

function referencePageSelection(
  session: Session,
  offered: OfferedList,
  id: ListPageButtonId | HoraPageButtonId,
  passthroughIds: string[] = [],
): SelectionOutcome {
  const hourPage = id === HoraPageButtonId.NEXT || id === HoraPageButtonId.PREV;
  const hours = session.state === SessionState.CITA_AWAITING_HORA_SELECT;
  if (hourPage !== hours || (hourPage && !passthroughIds.includes(id))) return { result: reshowOffered(session, offered) };
  const current = session.counters[hourPage ? CounterKey.CITA_HORA_PAGE : CounterKey.CITA_LIST_PAGE] ?? 0;
  const count = hourPage ? unpackHoraSlots(session.slots[SlotKey.CITA_HORAS_DIA]).length : offered.rows.length;
  const next = id === HoraPageButtonId.NEXT || id === ListPageButtonId.NEXT;
  const target = current + (next ? 1 : -1);
  if (target < 0 || target >= pageCount(count, session)) return { result: reshowOffered(session, offered) };
  return hourPage ? { replyId: id } : { result: turnPage(session, offered, id) };
}

function referenceTextSelection(
  session: Session,
  typed: string,
  offered: OfferedList,
  passthroughIds?: string[],
): SelectionOutcome | undefined {
  const size = listPageSize(session);
  if (size === WHATSAPP_LIST_MAX_ROWS) return undefined;
  const pageId = REFERENCE_PAGE_ANSWERS.get(normalizeText(typed));
  if (pageId) return referencePageSelection(session, offered, pageId, passthroughIds);
  const signedNumber = (typed.startsWith("-") || typed.startsWith("+")) && DIGITS_ONLY.test(typed.slice(1));
  if (!DIGITS_ONLY.test(typed) && !signedNumber) return undefined;
  const page = session.state === SessionState.CITA_AWAITING_HORA_SELECT ? 0 : (session.counters[CounterKey.CITA_LIST_PAGE] ?? 0);
  const rows = offered.rows.slice(page * size, (page + 1) * size);
  const row = OPTION_NUMBER.test(typed) ? rows[Number(typed) - 1] : undefined;
  return row ? { replyId: row.id, typed } : { result: reshowOffered(session, offered) };
}

export function resolveSelection(session: Session, event: InboundEvent, options: SelectionOptions = {}): SelectionOutcome {
  const offered = readOffered(session.slots);

  if (event.type === InboundEventType.LIST || event.type === InboundEventType.BUTTON) {
    const id = event.listId;
    if (!id) return { result: reshowOffered(session, offered) };
    if (offered && (id === ListPageButtonId.NEXT || id === ListPageButtonId.PREV)) return { result: turnPage(session, offered, id) };

    const valid = !offered || offered.rows.some((row) => row.id === id) || options.passthroughIds?.includes(id);
    return valid ? { replyId: id } : { result: reshowOffered(session, offered) };
  }

  const typed = event.type === InboundEventType.TEXT ? readTrimmedText(event) : "";
  if (!typed || !offered) {
    return { result: reshowOffered(session, offered) };
  }

  const referenceSelection = referenceTextSelection(session, typed, offered, options.passthroughIds);
  if (referenceSelection) return referenceSelection;

  const custom = options.customMatch?.(typed, offered.rows);
  if (custom?.kind === MatchKind.MATCH) return { replyId: custom.row.id, typed };
  if (custom?.kind === MatchKind.AMBIGUOUS) return { result: narrowOffered(session, custom.rows) };
  if (custom?.kind === MatchKind.NOTICE) return { result: reshowOffered(session, offered, custom.text) };
  if (custom?.kind === MatchKind.HANDLED) return { result: custom.result };

  const match = matchSelection(typed, offered.rows, { includeDescription: options.includeDescription });
  if (match.kind === MatchKind.MATCH) return { replyId: match.row.id, typed };
  if (match.kind === MatchKind.AMBIGUOUS) return { result: narrowOffered(session, match.rows) };

  return { result: options.onNoMatchText?.(typed) ?? reshowOffered(session, offered) };
}
