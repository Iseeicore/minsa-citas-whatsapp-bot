import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { normalizeText, toDisplayPlace } from "@/lib/fsm/parsing/text/text";
import { looksLikePlaceName, resolveDistritoText } from "@/lib/fsm/flows/cita/parsing/distrito-resolver";
import {
  buildResult,
  cloneSession,
  omitSlot,
  query,
  sendButtons,
  sendList,
  sendText,
  withNote,
  readTappedId,
  readTypedText,
} from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import type { TurnNote } from "@/lib/observability/types";
import { OtherDistritoButtonId } from "@/lib/enums/other-distrito-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { CounterKey } from "@/lib/enums/counter-key";
import { QueryKind } from "@/lib/enums/query-kind";
import { SearchSubject } from "@/lib/enums/search-subject";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { CITA_FAREWELL_TEXT } from "@/lib/constants/textos/cita-salida";
import { THAT_ESPECIALIDAD_TEXT } from "@/lib/constants/textos/cita-catalogo";
import {
  OTHER_DISTRITO_QUESTION_TEXT,
  ASK_OTHER_DISTRITO_TEXT,
  noCoverageText,
  CHANGE_DISTRITO_TEXT,
  noCoverageInPlaceText,
  NO_COVERAGE_IN_YOUR_AREA_TEXT,
  NO_COVERAGE_ESPECIALIDADES_TEXT,
  NO_ESTABLECIMIENTOS_QUESTION_TEXT,
  noEstablecimientosText,
  OTHER_DISTRITO_BUTTONS,
  NO_ESTABLECIMIENTOS_ROWS,
} from "@/lib/constants/textos/cita-ubicacion";
import { searchEstablecimientosPage } from "@/lib/fsm/flows/cita/steps/catalog/establecimiento-offer";
import { CHANGE_DISTRICT_ANSWERS, NO_ESTABLECIMIENTOS_ANSWERS } from "@/lib/constants/palabras-clave";
import { stringOr } from "@/lib/utils/text-values";
import { slotText } from "@/lib/fsm/core/slot-readers";

const DISTRICT_BOUND_SLOTS = [
  SlotKey.CITA_DISTRITO,
  SlotKey.CITA_PROVINCIA,
  SlotKey.CITA_DEPARTAMENTO,
  SlotKey.CITA_UBIGEO,
  SlotKey.CITA_ESPECIALIDAD_ID,
  SlotKey.CITA_COD_EESS,
  SlotKey.CITA_ESTABLECIMIENTO_NOMBRE,
  SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO,
  SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE,
  SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS,
  SlotKey.CITA_FECHA,
  SlotKey.CITA_FECHAS_DESCARTADAS,
  SlotKey.CITA_DISTRITO_HINT_TEXT,
  SlotKey.CITA_ESTABLECIMIENTO_HINT_TEXT,
  SlotKey.CITA_NO_COVERAGE_SUBJECT,
  SlotKey.INITIAL_MESSAGE_TEXT,
  SlotKey.CITA_OFFERED,
  SlotKey.CITA_OFFERED_NAMES,
];

const ESPECIALIDAD_BOUND_SLOTS = [
  SlotKey.CITA_ESPECIALIDAD_ID,
  SlotKey.CITA_ESPECIALIDAD_NOMBRE,
  SlotKey.CITA_ESPECIALIDAD_HINT_TEXT,
  SlotKey.CITA_COD_EESS,
  SlotKey.CITA_ESTABLECIMIENTO_NOMBRE,
  SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO,
  SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE,
  SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS,
  SlotKey.CITA_ESTABLECIMIENTO_SIN_FECHAS,
  SlotKey.CITA_ESTABLECIMIENTO_HINT_TEXT,
  SlotKey.CITA_FECHAS_DESCARTADAS,
  SlotKey.CITA_NO_COVERAGE_SUBJECT,
  SlotKey.CITA_OFFERED,
  SlotKey.CITA_OFFERED_NAMES,
];

const ESTABLECIMIENTO_PAGING_COUNTERS = [
  CounterKey.CITA_ESTABLECIMIENTOS_PAGE,
  CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES,
  CounterKey.CITA_ESTABLECIMIENTOS_EMPTY_SKIPS,
  CounterKey.CITA_ESTABLECIMIENTOS_BACK_FROM_PAGE,
  CounterKey.CITA_ESTABLECIMIENTOS_FIRST_PAGE,
  CounterKey.CITA_ESTABLECIMIENTOS_NEXT_PAGE,
];

const questionButtons = (text: string) => sendButtons(text, OTHER_DISTRITO_BUTTONS);
const noEstablecimientosOptions = (text: string) => sendList(text, NO_ESTABLECIMIENTOS_ROWS);

const isMissingEstablecimientos = (slots: Session["slots"]): boolean =>
  slots[SlotKey.CITA_NO_COVERAGE_SUBJECT] === SearchSubject.ESTABLECIMIENTOS;

export function offerOtherDistrito(
  session: Session,
  missing: SearchSubject.ESPECIALIDADES | SearchSubject.ESTABLECIMIENTOS,
): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.CITA_AWAITING_OTHER_DISTRITO;

  const distrito = stringOr(next.slots[SlotKey.CITA_DISTRITO]).trim();
  const where = distrito ? noCoverageInPlaceText(toDisplayPlace(distrito)) : NO_COVERAGE_IN_YOUR_AREA_TEXT;
  const note: TurnNote = { kind: "no_coverage", level: "warn", detail: { missing, distrito: distrito || "unknown" } };

  if (missing === SearchSubject.ESTABLECIMIENTOS) {
    next.slots[SlotKey.CITA_NO_COVERAGE_SUBJECT] = SearchSubject.ESTABLECIMIENTOS;
    const nombre = slotText(next.slots, SlotKey.CITA_ESPECIALIDAD_NOMBRE);
    const especialidad = nombre ? `*${nombre}*` : THAT_ESPECIALIDAD_TEXT;
    return withNote(buildResult(next, [noEstablecimientosOptions(noEstablecimientosText(especialidad, where))]), note);
  }

  delete next.slots[SlotKey.CITA_NO_COVERAGE_SUBJECT];
  return withNote(buildResult(next, [questionButtons(noCoverageText(NO_COVERAGE_ESPECIALIDADES_TEXT, where))]), note);
}

export function offerChangeDistrito(session: Session, source: "local" | "ai"): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.CITA_AWAITING_OTHER_DISTRITO;
  delete next.slots[SlotKey.CITA_NO_COVERAGE_SUBJECT];
  return withNote(buildResult(next, [questionButtons(CHANGE_DISTRITO_TEXT)]), {
    kind: "change_distrito",
    detail: { state: session.state, source },
  });
}

export function askOtherDistrito(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.slots = DISTRICT_BOUND_SLOTS.reduce(omitSlot, next.slots);
  next.state = SessionState.CITA_AWAITING_DISTRITO_AI;
  return buildResult(next, [sendText(ASK_OTHER_DISTRITO_TEXT)]);
}

function searchOtherEspecialidad(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.slots = ESPECIALIDAD_BOUND_SLOTS.reduce(omitSlot, next.slots);
  for (const counter of ESTABLECIMIENTO_PAGING_COUNTERS) delete next.counters[counter];
  next.state = SessionState.CITA_ESPECIALIDAD_PENDING;
  return buildResult(next, [query(QueryKind.LIST_ESPECIALIDADES, { ubigeo: slotText(next.slots, SlotKey.CITA_UBIGEO) })]);
}

function returnToPreviousList(session: Session): HandlerResult {
  const first = session.counters[CounterKey.CITA_ESTABLECIMIENTOS_FIRST_PAGE];
  if (first === undefined) return searchOtherEspecialidad(session);

  const next = cloneSession(session);
  delete next.slots[SlotKey.CITA_NO_COVERAGE_SUBJECT];
  delete next.counters[CounterKey.CITA_ESTABLECIMIENTOS_EMPTY_SKIPS];
  delete next.counters[CounterKey.CITA_ESTABLECIMIENTOS_BACK_FROM_PAGE];
  delete next.counters[CounterKey.CITA_ESTABLECIMIENTOS_NEXT_PAGE];
  return searchEstablecimientosPage(next, first);
}

export function handleOtherDistrito(session: Session, event: InboundEvent): HandlerResult {
  const missingEstablecimientos = isMissingEstablecimientos(session.slots);
  const typed = readTypedText(event);
  const choice = readTappedId(event) ?? (missingEstablecimientos ? NO_ESTABLECIMIENTOS_ANSWERS.get(normalizeText(typed)) : undefined);
  const answer = typed && CHANGE_DISTRICT_ANSWERS.has(normalizeText(typed)) ? Confirmation.YES : resolveConfirmation(typed);

  if (choice === OtherDistritoButtonId.OTHER_ESPECIALIDAD) return searchOtherEspecialidad(session);
  if (missingEstablecimientos && choice === OtherDistritoButtonId.BACK) return returnToPreviousList(session);

  if (choice === OtherDistritoButtonId.YES || answer === Confirmation.YES) return askOtherDistrito(session);

  if (choice === OtherDistritoButtonId.NO || answer === Confirmation.NO) {
    return buildResult({ state: SessionState.CITA_NO_COVERAGE_CLOSED, slots: {}, counters: {} }, [sendText(CITA_FAREWELL_TEXT)]);
  }

  if (typed && looksLikePlaceName(typed)) {
    const next = cloneSession(session);
    next.slots = DISTRICT_BOUND_SLOTS.reduce(omitSlot, next.slots);
    return resolveDistritoText(next, typed, undefined);
  }

  const reprompt = missingEstablecimientos
    ? noEstablecimientosOptions(NO_ESTABLECIMIENTOS_QUESTION_TEXT)
    : questionButtons(OTHER_DISTRITO_QUESTION_TEXT);
  return withNote(buildResult(session, [reprompt]), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "other_distrito" },
  });
}
