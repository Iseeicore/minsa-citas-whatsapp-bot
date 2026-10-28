import { SearchSubject } from "@/lib/enums/search-subject";
import { QueryKind } from "@/lib/enums/query-kind";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { askOtherDistrito, offerChangeDistrito, offerOtherDistrito } from "@/lib/fsm/flows/cita/steps/catalog/no-coverage";
import { buildResult, cloneSession, query, readTappedId, readTypedText, withNote } from "@/lib/fsm/core/handlers-shared";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { offeredFullName, rememberFullNames } from "@/lib/fsm/flows/cita/data/catalog-names";
import { hintText, leftoverHint, matchAllTokens, readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { reshowOffered, resolveSelection, clearOffered } from "@/lib/fsm/flows/cita/parsing/selection";
import { askToLeave } from "@/lib/fsm/flows/cita/steps/exit/exit";
import { discardedEspecialidades } from "@/lib/fsm/flows/cita/steps/booking/duplicate";
import {
  acceptProposedEstablecimiento,
  discardedEstablecimientos,
  isSearchingOtherEstablecimiento,
  offerOtherEstablecimiento,
} from "@/lib/fsm/flows/cita/steps/catalog/other-establecimiento";
import {
  acceptDetectedEspecialidad,
  especialidadHintMatches,
  offerEspecialidades,
  offerEspecialidadesWithoutHint,
  type EspecialidadResultItem,
} from "@/lib/fsm/flows/cita/steps/catalog/especialidad-offer";
import {
  chooseEstablecimiento,
  detectEstablecimiento,
  establecimientoFullName,
  establecimientoPageRows,
  establecimientoPaging,
  offerEstablecimientos,
  proposeEstablecimiento,
  reshowEstablecimientoConfirm,
  searchEstablecimientosPage,
  type EstablecimientoResultItem,
} from "@/lib/fsm/flows/cita/steps/catalog/establecimiento-offer";
import { searchFailureGate } from "@/lib/fsm/flows/cita/steps/catalog/search-failure-gate";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { EstablecimientoPageRowId } from "@/lib/enums/establecimiento-page-row-id";
import { EstablecimientoConfirmButtonId } from "@/lib/enums/establecimiento-confirm-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { SessionState } from "@/lib/enums/session-state";
import { SUBSTANTIAL_WORD } from "@/lib/constants/regex/catalog";
import { OPTION_NOT_IDENTIFIED_TEXT } from "@/lib/constants/textos/comunes";
import { OTHER_SEDE_ANSWERS } from "@/lib/constants/palabras-clave";
import { CatalogStatus } from "@/lib/enums/catalog-status";
import { SelectionStep } from "@/lib/enums/selection-step";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { isString } from "@/lib/utils/type-guards";
import { availableEstablecimientos, nextPageAfterEmpty } from "@/lib/utils/catalog";
import { HINT_MAX_LENGTH } from "@/lib/constants/limits/cita";
import { ESTABLECIMIENTOS_MAX_EMPTY_PAGE_SKIPS } from "@/lib/constants/limits/minsa";

export function handleEspecialidadPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: EspecialidadResultItem[] };
  const next = cloneSession(session);

  const failure = searchFailureGate(next, result.status, SessionState.CITA_ESPECIALIDAD_PENDING, SearchSubject.ESPECIALIDADES);
  if (failure) return failure;

  const discarded = discardedEspecialidades(next.slots);
  const items = result.items?.filter((item) => !discarded.includes(item.codigoEspecialidad)) ?? [];
  if (result.status !== CatalogStatus.FOUND || items.length === 0) {
    return offerOtherDistrito(next, SearchSubject.ESPECIALIDADES);
  }

  const hint = next.slots[SlotKey.CITA_ESPECIALIDAD_HINT_TEXT];
  const matches = hint ? especialidadHintMatches(hint, items) : [];
  if (matches.length === 1) return acceptDetectedEspecialidad(next, matches[0]);
  if (hint && matches.length === 0) return offerEspecialidadesWithoutHint(next, items, hint);
  return offerEspecialidades(next, items);
}

function askSelectionHints(session: Session, step: SelectionStep, typed: string): HandlerResult | undefined {
  if (!SUBSTANTIAL_WORD.test(typed) || !readOffered(session.slots)) return undefined;

  const next = cloneSession(session);
  next.state = SessionState.CITA_SELECTION_HINTS_PENDING;
  next.slots[SlotKey.CITA_SELECTION_STEP] = step;
  return buildResult(next, [query(QueryKind.EXTRACT_SELECTION_HINTS, { step, text: typed })]);
}

export function handleSelectionHintsPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as {
    especialidad?: unknown;
    establecimiento?: unknown;
    quiereSalir?: boolean;
    quiereCambiarDistrito?: boolean;
  };
  const step =
    session.slots[SlotKey.CITA_SELECTION_STEP] === SelectionStep.ESTABLECIMIENTO
      ? SelectionStep.ESTABLECIMIENTO
      : SelectionStep.ESPECIALIDAD;
  const offered = readOffered(session.slots);

  const restored = cloneSession(session);
  delete restored.slots[SlotKey.CITA_SELECTION_STEP];
  restored.state =
    step === SelectionStep.ESTABLECIMIENTO
      ? SessionState.CITA_AWAITING_ESTABLECIMIENTO_SELECT
      : SessionState.CITA_AWAITING_ESPECIALIDAD_SELECT;

  if (result.quiereSalir === true) return askToLeave(restored, "ai");
  if (result.quiereCambiarDistrito === true) return offerChangeDistrito(restored, "ai");

  const own = step === SelectionStep.ESTABLECIMIENTO ? result.establecimiento : result.especialidad;
  const matched = isString(own) && offered ? matchAllTokens(own, offered.rows) : undefined;

  if (!matched) {
    return reshowOffered(restored, offered, OPTION_NOT_IDENTIFIED_TEXT);
  }

  if (step === SelectionStep.ESPECIALIDAD && isString(result.establecimiento)) {
    const hint = hintText(result.establecimiento).slice(0, HINT_MAX_LENGTH);
    if (hint) restored.slots[SlotKey.CITA_ESTABLECIMIENTO_HINT_TEXT] = hint;
  }

  const tap: InboundEvent = { from: event.from, type: InboundEventType.LIST, listId: matched.id };
  return step === SelectionStep.ESTABLECIMIENTO
    ? handleAwaitingEstablecimientoSelect(restored, tap)
    : handleAwaitingEspecialidadSelect(restored, tap);
}

export function handleAwaitingEspecialidadSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, {
    includeDescription: true,
    onNoMatchText: (typed) => askSelectionHints(session, SelectionStep.ESPECIALIDAD, typed),
  });
  if ("result" in outcome) return outcome.result;
  const replyId = outcome.replyId;

  const chosen = readOffered(session.slots)?.rows.find((row) => row.id === replyId);

  const next = clearOffered(session);
  if (outcome.typed && chosen) {
    const hint = leftoverHint(outcome.typed, { ...chosen, title: offeredFullName(session.slots, chosen) }).slice(0, HINT_MAX_LENGTH);
    if (hint) next.slots[SlotKey.CITA_ESTABLECIMIENTO_HINT_TEXT] = hint;
  }
  next.slots[SlotKey.CITA_ESPECIALIDAD_ID] = replyId;
  if (chosen) next.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE] = offeredFullName(session.slots, chosen);
  next.state = SessionState.CITA_ESTABLECIMIENTO_PENDING;
  return buildResult(next, [
    query(QueryKind.LIST_ESTABLECIMIENTOS, {
      especialidadId: replyId,
      ubigeo: slotText(next.slots, SlotKey.CITA_UBIGEO),
    }),
  ]);
}

function skipEmptyPage(next: Session, page: number, totalPages: number): HandlerResult | undefined {
  const skips = next.counters[CounterKey.CITA_ESTABLECIMIENTOS_EMPTY_SKIPS] ?? 0;
  const backFrom = next.counters[CounterKey.CITA_ESTABLECIMIENTOS_BACK_FROM_PAGE];
  const jump = nextPageAfterEmpty({ page, totalPages, skips, backFrom }, ESTABLECIMIENTOS_MAX_EMPTY_PAGE_SKIPS);
  if (!jump) return undefined;

  if (jump.clearBackFrom) delete next.counters[CounterKey.CITA_ESTABLECIMIENTOS_BACK_FROM_PAGE];
  next.counters[CounterKey.CITA_ESTABLECIMIENTOS_EMPTY_SKIPS] = jump.skips;
  return searchEstablecimientosPage(next, jump.page);
}

export function handleEstablecimientoPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: EstablecimientoResultItem[]; page?: number; totalPages?: number };
  const next = cloneSession(session);

  const hint = next.slots[SlotKey.CITA_ESTABLECIMIENTO_HINT_TEXT];
  delete next.slots[SlotKey.CITA_ESTABLECIMIENTO_HINT_TEXT];

  const failure = searchFailureGate(next, result.status, SessionState.CITA_ESTABLECIMIENTO_PENDING, SearchSubject.ESTABLECIMIENTOS);
  if (failure) return failure;

  if (result.page !== undefined && result.totalPages !== undefined) {
    next.counters[CounterKey.CITA_ESTABLECIMIENTOS_PAGE] = result.page;
    next.counters[CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES] = result.totalPages;
  } else {
    delete next.counters[CounterKey.CITA_ESTABLECIMIENTOS_PAGE];
    delete next.counters[CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES];
  }
  const { page, totalPages } = establecimientoPaging(next.counters);

  const discarded = discardedEstablecimientos(next.slots);
  const items = result.status === CatalogStatus.FOUND ? availableEstablecimientos(result.items ?? [], discarded) : [];

  const skipped = result.status === CatalogStatus.FOUND && items.length === 0 ? skipEmptyPage(next, page, totalPages) : undefined;
  if (skipped) return skipped;
  delete next.counters[CounterKey.CITA_ESTABLECIMIENTOS_EMPTY_SKIPS];
  delete next.counters[CounterKey.CITA_ESTABLECIMIENTOS_BACK_FROM_PAGE];

  if (items.length > 0) {
    rememberFullNames(
      next.slots,
      items.map((item) => ({ id: item.renipressCode, full: establecimientoFullName(item) })),
    );
  }

  if (isSearchingOtherEstablecimiento(next.slots)) {
    return offerOtherEstablecimiento(
      next,
      items.map((item) => ({ id: item.renipressCode, name: establecimientoFullName(item) })),
      establecimientoPageRows(items, next.counters),
    );
  }

  if (items.length === 0) return offerOtherDistrito(next, SearchSubject.ESTABLECIMIENTOS);

  const detected = detectEstablecimiento(hint, items);
  if (detected) return chooseEstablecimiento(next, detected);
  if (items.length === 1 && totalPages <= 1) return proposeEstablecimiento(next, items[0]);
  return offerEstablecimientos(next, items);
}

export function handleAwaitingEstablecimientoConfirm(session: Session, event: InboundEvent): HandlerResult {
  const tapped = readTappedId(event);
  const typed = readTypedText(event);

  if (tapped === EstablecimientoConfirmButtonId.CONFIRM || resolveConfirmation(typed) === Confirmation.YES) {
    return acceptProposedEstablecimiento(session);
  }
  if (tapped === EstablecimientoConfirmButtonId.OTHER_SEDE || OTHER_SEDE_ANSWERS.has(normalizeText(typed)))
    return askOtherDistrito(session);

  return withNote(reshowEstablecimientoConfirm(session), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "establecimiento_confirm" },
  });
}

export function handleAwaitingEstablecimientoSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, {
    includeDescription: true,
    onNoMatchText: (typed) => askSelectionHints(session, SelectionStep.ESTABLECIMIENTO, typed),
  });
  if ("result" in outcome) return outcome.result;
  const replyId = outcome.replyId;

  if (replyId === EstablecimientoPageRowId.NEXT || replyId === EstablecimientoPageRowId.PREV) {
    const current = establecimientoPaging(session.counters).page;
    const next = clearOffered(session);
    delete next.counters[CounterKey.CITA_ESTABLECIMIENTOS_EMPTY_SKIPS];
    if (replyId === EstablecimientoPageRowId.NEXT) {
      delete next.counters[CounterKey.CITA_ESTABLECIMIENTOS_BACK_FROM_PAGE];
      return searchEstablecimientosPage(next, current + 1);
    }
    next.counters[CounterKey.CITA_ESTABLECIMIENTOS_BACK_FROM_PAGE] = current;
    return searchEstablecimientosPage(next, Math.max(1, current - 1));
  }

  const chosen = readOffered(session.slots)?.rows.find((row) => row.id === replyId);
  const next = clearOffered(session);
  next.slots[SlotKey.CITA_COD_EESS] = replyId;
  if (chosen) next.slots[SlotKey.CITA_ESTABLECIMIENTO_NOMBRE] = offeredFullName(session.slots, chosen);
  next.state = SessionState.CITA_FECHA_PENDING;
  return buildResult(next, [
    query(QueryKind.LIST_FECHAS, {
      codEess: replyId,
      especialidadId: slotText(next.slots, SlotKey.CITA_ESPECIALIDAD_ID),
    }),
  ]);
}
