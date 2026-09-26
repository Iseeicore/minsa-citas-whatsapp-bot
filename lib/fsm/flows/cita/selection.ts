import {
  buildResult,
  cloneSession,
  LIST_PAGE_COUNTER,
  LIST_PAGE_NEXT_ID,
  LIST_PAGE_PREV_ID,
  offerPagedList,
  pageCount,
  pageEffects,
  sendText,
} from "@/lib/fsm/core/handlers-shared";
import {
  matchSelection,
  OFFERED_SLOT,
  readOffered,
  type OfferedList,
  type OfferedRow,
  type SelectionMatch,
} from "@/lib/fsm/parsing/selection-matchers";
import type { HandlerResult, InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";

export const SELECTION_REJECTION = "Selecciona una opción de la lista.";
export const NARROWED_LIST_TEXT = "Encontramos varias coincidencias. Selecciona una:";

export function clearOffered(session: Session): Session {
  const next = cloneSession(session);
  delete next.slots[OFFERED_SLOT];
  delete next.counters[LIST_PAGE_COUNTER];
  return next;
}

export function reshowOffered(
  session: Session,
  offered: OfferedList | undefined,
  message: string = SELECTION_REJECTION,
): HandlerResult {
  const effects: SendEffect[] = [sendText(message)];
  if (offered) effects.push(...pageEffects(offered.text, offered.rows, session.counters[LIST_PAGE_COUNTER] ?? 0));
  return buildResult(session, effects);
}

function narrowOffered(session: Session, rows: OfferedRow[]): HandlerResult {
  const next = cloneSession(session);
  return buildResult(next, offerPagedList(next, NARROWED_LIST_TEXT, rows));
}

function turnPage(session: Session, offered: OfferedList, id: string): HandlerResult {
  const next = cloneSession(session);
  const current = next.counters[LIST_PAGE_COUNTER] ?? 0;
  const target = id === LIST_PAGE_NEXT_ID ? current + 1 : current - 1;
  const page = Math.min(Math.max(target, 0), pageCount(offered.rows.length) - 1);
  if (page === 0) delete next.counters[LIST_PAGE_COUNTER];
  else next.counters[LIST_PAGE_COUNTER] = page;
  return buildResult(next, pageEffects(offered.text, offered.rows, page));
}

export type CustomMatch =
  | SelectionMatch
  | { kind: "notice"; text: string }
  | { kind: "handled"; result: HandlerResult };

type SelectionOptions = {
  customMatch?: (typed: string, rows: OfferedRow[]) => CustomMatch | undefined;
  includeDescription?: boolean;
  passthroughIds?: string[];
  onNoMatchText?: (typed: string) => HandlerResult | undefined;
};

type SelectionOutcome = { replyId: string; typed?: string } | { result: HandlerResult };

export function resolveSelection(
  session: Session,
  event: InboundEvent,
  options: SelectionOptions = {},
): SelectionOutcome {
  const offered = readOffered(session.slots);

  if (event.type === "list" || event.type === "button") {
    const id = event.listId;
    if (!id) return { result: reshowOffered(session, offered) };
    if (offered && (id === LIST_PAGE_NEXT_ID || id === LIST_PAGE_PREV_ID)) return { result: turnPage(session, offered, id) };

    const valid =
      !offered || offered.rows.some((row) => row.id === id) || options.passthroughIds?.includes(id);
    return valid ? { replyId: id } : { result: reshowOffered(session, offered) };
  }

  const typed = event.type === "text" ? (event.text ?? "").trim() : "";
  if (!typed || !offered) {
    return { result: reshowOffered(session, offered) };
  }

  const custom = options.customMatch?.(typed, offered.rows);
  if (custom?.kind === "match") return { replyId: custom.row.id, typed };
  if (custom?.kind === "ambiguous") return { result: narrowOffered(session, custom.rows) };
  if (custom?.kind === "notice") return { result: reshowOffered(session, offered, custom.text) };
  if (custom?.kind === "handled") return { result: custom.result };

  const match = matchSelection(typed, offered.rows, { includeDescription: options.includeDescription });
  if (match.kind === "match") return { replyId: match.row.id, typed };
  if (match.kind === "ambiguous") return { result: narrowOffered(session, match.rows) };

  return { result: options.onNoMatchText?.(typed) ?? reshowOffered(session, offered) };
}
