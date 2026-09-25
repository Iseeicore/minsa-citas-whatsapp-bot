import { buildResult, cloneSession, offerList, sendText, sendList } from "@/lib/fsm/core/handlers-shared";
import {
  matchSelection,
  OFFERED_SLOT,
  readOffered,
  type OfferedList,
  type OfferedRow,
  type SelectionMatch,
} from "@/lib/fsm/parsing/selection-matchers";
import type { HandlerResult, InboundEvent, SendEffect, Session } from "@/lib/fsm/core/types";

// ---- Selection steps: taps and typed text ---------------------------------
// Every list is sent through offerList so the rows the citizen can pick from
// are remembered (Session.slots only holds scalars, hence a JSON string).
// resolveSelection then turns whatever arrives — a tap, or typed text such as
// "el segundo" / "odontología" / "el de Lima" — into one of THOSE rows, or
// into a rejection that re-shows the list. Unparsed text never reaches MINSA.

export const SELECTION_REJECTION = "Selecciona una opción de la lista.";
export const NARROWED_LIST_TEXT = "Encontramos varias coincidencias. Selecciona una:";

export function clearOffered(session: Session): Session {
  const next = cloneSession(session);
  delete next.slots[OFFERED_SLOT];
  return next;
}

export function reshowOffered(
  session: Session,
  offered: OfferedList | undefined,
  message: string = SELECTION_REJECTION,
): HandlerResult {
  const effects: SendEffect[] = [sendText(message)];
  if (offered) effects.push(sendList(offered.text, offered.rows));
  return buildResult(session, effects);
}

function narrowOffered(session: Session, rows: OfferedRow[]): HandlerResult {
  const next = cloneSession(session);
  return buildResult(next, [offerList(next, NARROWED_LIST_TEXT, rows)]);
}

// A step-specific reader tried before the generic ordinal/name matcher. It can
// also explain why nothing was chosen ("notice") instead of a bare rejection.
export type CustomMatch =
  | SelectionMatch
  | { kind: "notice"; text: string }
  // The step already knows the whole answer (e.g. a two-button question).
  | { kind: "handled"; result: HandlerResult };

type SelectionOptions = {
  customMatch?: (typed: string, rows: OfferedRow[]) => CustomMatch | undefined;
  // Match typed text against "Provincia — Departamento" descriptions too.
  includeDescription?: boolean;
  // Ids that are valid taps although they are not list rows (pagination buttons).
  passthroughIds?: string[];
  // Text that names nothing offered; return undefined to just re-show the list.
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

    // Sessions opened before offered options were stored have nothing to
    // validate against: keep accepting their taps.
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
