import {
  buildResult,
  cloneSession,
  offerPagedList,
  pageCount,
  pageEffects,
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
  if (offered) effects.push(...pageEffects(offered.text, offered.rows, session.counters[CounterKey.CITA_LIST_PAGE] ?? 0, offered.pageSize));
  return buildResult(session, effects);
}

function narrowOffered(session: Session, offered: OfferedList, rows: OfferedRow[]): HandlerResult {
  const next = cloneSession(session);
  return buildResult(next, offerPagedList(next, NARROWED_LIST_TEXT, rows, offered.pageSize));
}

function turnPage(session: Session, offered: OfferedList, id: string): HandlerResult {
  const next = cloneSession(session);
  const current = next.counters[CounterKey.CITA_LIST_PAGE] ?? 0;
  const target = id === ListPageButtonId.NEXT ? current + 1 : current - 1;
  const page = Math.min(Math.max(target, 0), pageCount(offered.rows.length, offered.pageSize) - 1);
  if (page === 0) delete next.counters[CounterKey.CITA_LIST_PAGE];
  else next.counters[CounterKey.CITA_LIST_PAGE] = page;
  return buildResult(next, pageEffects(offered.text, offered.rows, page, offered.pageSize));
}

export type CustomMatch = SelectionMatch | { kind: MatchKind.NOTICE; text: string } | { kind: MatchKind.HANDLED; result: HandlerResult };

type SelectionOptions = {
  customMatch?: (typed: string, rows: OfferedRow[]) => CustomMatch | undefined;
  includeDescription?: boolean;
  passthroughIds?: string[];
  onNoMatchText?: (typed: string) => HandlerResult | undefined;
};

type SelectionOutcome = { replyId: string; typed?: string } | { result: HandlerResult };

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

  const custom = options.customMatch?.(typed, offered.rows);
  if (custom?.kind === MatchKind.MATCH) return { replyId: custom.row.id, typed };
  if (custom?.kind === MatchKind.AMBIGUOUS) return { result: narrowOffered(session, offered, custom.rows) };
  if (custom?.kind === MatchKind.NOTICE) return { result: reshowOffered(session, offered, custom.text) };
  if (custom?.kind === MatchKind.HANDLED) return { result: custom.result };

  const match = matchSelection(typed, offered.rows, { includeDescription: options.includeDescription });
  if (match.kind === MatchKind.MATCH) return { replyId: match.row.id, typed };
  if (match.kind === MatchKind.AMBIGUOUS) return { result: narrowOffered(session, offered, match.rows) };

  return { result: options.onNoMatchText?.(typed) ?? reshowOffered(session, offered) };
}
