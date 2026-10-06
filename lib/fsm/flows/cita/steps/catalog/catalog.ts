import { SearchSubject } from "@/lib/enums/search-subject";
import { QueryKind } from "@/lib/enums/query-kind";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { offerChangeDistrito, offerOtherDistrito } from "@/lib/fsm/flows/cita/steps/catalog/no-coverage";
import { buildResult, cloneSession, query, sendText } from "@/lib/fsm/core/handlers-shared";
import { offeredFullName, rememberFullNames } from "@/lib/fsm/flows/cita/data/catalog-names";
import { hintText, leftoverHint, matchAllTokens, readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { reshowOffered, SELECTION_REJECTION, resolveSelection, clearOffered } from "@/lib/fsm/flows/cita/parsing/selection";
import { askToLeave } from "@/lib/fsm/flows/cita/steps/exit/exit";
import { discardedEspecialidades } from "@/lib/fsm/flows/cita/steps/booking/duplicate";
import {
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
  establecimientoRows,
  offerEstablecimientos,
  type EstablecimientoResultItem,
} from "@/lib/fsm/flows/cita/steps/catalog/establecimiento-offer";
import { searchFailureGate } from "@/lib/fsm/flows/cita/steps/catalog/search-failure-gate";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

export function handleEspecialidadPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: EspecialidadResultItem[] };
  const next = cloneSession(session);

  const failure = searchFailureGate(next, result.status, SessionState.CITA_ESPECIALIDAD_PENDING, SearchSubject.ESPECIALIDADES);
  if (failure) return failure;

  const discarded = discardedEspecialidades(next.slots);
  const items = result.items?.filter((item) => !discarded.includes(item.codigoEspecialidad)) ?? [];
  if (result.status !== "found" || items.length === 0) {
    return offerOtherDistrito(next, SearchSubject.ESPECIALIDADES);
  }

  const hint = next.slots[SlotKey.CITA_ESPECIALIDAD_HINT_TEXT];
  const matches = hint ? especialidadHintMatches(hint, items) : [];
  if (matches.length === 1) return acceptDetectedEspecialidad(next, matches[0]);
  if (hint && matches.length === 0) return offerEspecialidadesWithoutHint(next, items, hint);
  return offerEspecialidades(next, items);
}

const HINT_MAX_LENGTH = 80;

function askSelectionHints(
  session: Session,
  step: "especialidad" | "establecimiento",
  typed: string,
): HandlerResult | undefined {
  if (!/\p{L}{5,}/u.test(typed) || !readOffered(session.slots)) return undefined;

  const next = cloneSession(session);
  next.state = SessionState.CITA_SELECTION_HINTS_PENDING;
  next.slots[SlotKey.CITA_SELECTION_STEP] = step;
  return buildResult(next, [
    sendText("Un momento, estamos revisando tu respuesta…"),
    query(QueryKind.EXTRACT_SELECTION_HINTS, { step, text: typed }),
  ]);
}

export function handleSelectionHintsPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { especialidad?: unknown; establecimiento?: unknown; quiereSalir?: boolean; quiereCambiarDistrito?: boolean };
  const step = session.slots[SlotKey.CITA_SELECTION_STEP] === "establecimiento" ? "establecimiento" : "especialidad";
  const offered = readOffered(session.slots);

  const restored = cloneSession(session);
  delete restored.slots[SlotKey.CITA_SELECTION_STEP];
  restored.state =
    step === "establecimiento" ? SessionState.CITA_AWAITING_ESTABLECIMIENTO_SELECT : SessionState.CITA_AWAITING_ESPECIALIDAD_SELECT;

  if (result.quiereSalir === true) return askToLeave(restored, "ai");
  if (result.quiereCambiarDistrito === true) return offerChangeDistrito(restored, "ai");

  const own = step === "establecimiento" ? result.establecimiento : result.especialidad;
  const matched = typeof own === "string" && offered ? matchAllTokens(own, offered.rows) : undefined;

  if (!matched) {
    return reshowOffered(restored, offered, `No pudimos identificar esa opción. ${SELECTION_REJECTION}`);
  }

  if (step === "especialidad" && typeof result.establecimiento === "string") {
    const hint = hintText(result.establecimiento).slice(0, HINT_MAX_LENGTH);
    if (hint) restored.slots[SlotKey.CITA_ESTABLECIMIENTO_HINT_TEXT] = hint;
  }

  const tap: InboundEvent = { from: event.from, type: InboundEventType.LIST, listId: matched.id };
  return step === "establecimiento"
    ? handleAwaitingEstablecimientoSelect(restored, tap)
    : handleAwaitingEspecialidadSelect(restored, tap);
}

export function handleAwaitingEspecialidadSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, {
    includeDescription: true,
    onNoMatchText: (typed) => askSelectionHints(session, "especialidad", typed),
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
    sendText("Buscando establecimientos…"),
    query(QueryKind.LIST_ESTABLECIMIENTOS, {
      especialidadId: replyId,
      ubigeo: String(next.slots[SlotKey.CITA_UBIGEO] ?? ""),
    }),
  ]);
}

export function handleEstablecimientoPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: EstablecimientoResultItem[] };
  const next = cloneSession(session);

  const hint = next.slots[SlotKey.CITA_ESTABLECIMIENTO_HINT_TEXT];
  delete next.slots[SlotKey.CITA_ESTABLECIMIENTO_HINT_TEXT];

  const failure = searchFailureGate(next, result.status, SessionState.CITA_ESTABLECIMIENTO_PENDING, SearchSubject.ESTABLECIMIENTOS);
  if (failure) return failure;

  const discarded = discardedEstablecimientos(next.slots);
  const items = result.status === "found" ? (result.items ?? []).filter((item) => !discarded.includes(item.renipressCode)) : [];

  if (items.length > 0) {
    rememberFullNames(next.slots, items.map((item) => ({ id: item.renipressCode, full: establecimientoFullName(item) })));
  }

  if (isSearchingOtherEstablecimiento(next.slots)) {
    return offerOtherEstablecimiento(
      next,
      items.map((item) => ({ id: item.renipressCode, name: establecimientoFullName(item) })),
      establecimientoRows(items),
    );
  }

  if (items.length === 0) return offerOtherDistrito(next, SearchSubject.ESTABLECIMIENTOS);
  if (items.length === 1) return chooseEstablecimiento(next, items[0], "encontrado");

  const detected = detectEstablecimiento(hint, items);
  return detected ? chooseEstablecimiento(next, detected, "detectado") : offerEstablecimientos(next, items);
}

export function handleAwaitingEstablecimientoSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, {
    includeDescription: true,
    onNoMatchText: (typed) => askSelectionHints(session, "establecimiento", typed),
  });
  if ("result" in outcome) return outcome.result;
  const replyId = outcome.replyId;

  const chosen = readOffered(session.slots)?.rows.find((row) => row.id === replyId);
  const next = clearOffered(session);
  next.slots[SlotKey.CITA_COD_EESS] = replyId;
  if (chosen) next.slots[SlotKey.CITA_ESTABLECIMIENTO_NOMBRE] = offeredFullName(session.slots, chosen);
  next.state = SessionState.CITA_FECHA_PENDING;
  return buildResult(next, [
    sendText("Buscando fechas disponibles…"),
    query(QueryKind.LIST_FECHAS, {
      codEess: replyId,
      especialidadId: String(next.slots[SlotKey.CITA_ESPECIALIDAD_ID] ?? ""),
    }),
  ]);
}
