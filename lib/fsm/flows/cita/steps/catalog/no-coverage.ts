import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { normalizeText, toDisplayPlace } from "@/lib/fsm/parsing/text/text";
import { looksLikePlaceName, resolveDistritoText } from "@/lib/fsm/flows/cita/parsing/distrito-resolver";
import { buildResult, cloneSession, omitSlot, sendButtons, sendText, withNote, readTappedId, readTypedText } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { OtherDistritoButtonId } from "@/lib/enums/other-distrito-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { SearchSubject } from "@/lib/enums/search-subject";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { CITA_FAREWELL_TEXT } from "@/lib/constants/textos/cita-salida";
import {
  OTHER_DISTRITO_QUESTION_TEXT,
  ASK_OTHER_DISTRITO_TEXT,
  noCoverageText,
  CHANGE_DISTRITO_TEXT,
  noCoverageInPlaceText,
  NO_COVERAGE_IN_YOUR_AREA_TEXT,
  NO_COVERAGE_ESPECIALIDADES_TEXT,
  NO_COVERAGE_ESTABLECIMIENTOS_TEXT,
  OTHER_DISTRITO_BUTTONS,
} from "@/lib/constants/textos/cita-ubicacion";
import { CHANGE_DISTRICT_ANSWERS } from "@/lib/constants/palabras-clave";
import { stringOr } from "@/lib/utils/text-values";

const DISTRICT_BOUND_SLOTS = [
  SlotKey.CITA_DISTRITO,
  SlotKey.CITA_PROVINCIA,
  SlotKey.CITA_DEPARTAMENTO,
  SlotKey.CITA_UBIGEO,
  SlotKey.CITA_ESPECIALIDAD_ID,
  SlotKey.CITA_COD_EESS,
  SlotKey.CITA_ESTABLECIMIENTO_NOMBRE,
  SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS,
  SlotKey.CITA_FECHA,
  SlotKey.CITA_FECHAS_DESCARTADAS,
  SlotKey.CITA_DISTRITO_HINT_TEXT,
  SlotKey.CITA_ESTABLECIMIENTO_HINT_TEXT,
  SlotKey.INITIAL_MESSAGE_TEXT,
  SlotKey.CITA_OFFERED,
  SlotKey.CITA_OFFERED_NAMES,
];

const questionButtons = (text: string) =>
  sendButtons(text, OTHER_DISTRITO_BUTTONS);

export function offerOtherDistrito(
  session: Session,
  missing: SearchSubject.ESPECIALIDADES | SearchSubject.ESTABLECIMIENTOS,
): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.CITA_AWAITING_OTHER_DISTRITO;

  const distrito = stringOr(next.slots[SlotKey.CITA_DISTRITO]).trim();
  const where = distrito ? noCoverageInPlaceText(toDisplayPlace(distrito)) : NO_COVERAGE_IN_YOUR_AREA_TEXT;
  const what = missing === SearchSubject.ESPECIALIDADES ? NO_COVERAGE_ESPECIALIDADES_TEXT : NO_COVERAGE_ESTABLECIMIENTOS_TEXT;

  return withNote(
    buildResult(next, [questionButtons(noCoverageText(what, where))]),
    { kind: "no_coverage", level: "warn", detail: { missing, distrito: distrito || "unknown" } },
  );
}

export function offerChangeDistrito(session: Session, source: "local" | "ai"): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.CITA_AWAITING_OTHER_DISTRITO;
  return withNote(
    buildResult(next, [
      questionButtons(CHANGE_DISTRITO_TEXT),
    ]),
    { kind: "change_distrito", detail: { state: session.state, source } },
  );
}

export function handleOtherDistrito(session: Session, event: InboundEvent): HandlerResult {
  const tapped = readTappedId(event);
  const typed = readTypedText(event);
  const answer =
    typed && CHANGE_DISTRICT_ANSWERS.has(normalizeText(typed)) ? Confirmation.YES : resolveConfirmation(typed);

  if (tapped === OtherDistritoButtonId.YES || answer === Confirmation.YES) {
    const next = cloneSession(session);
    next.slots = DISTRICT_BOUND_SLOTS.reduce(omitSlot, next.slots);
    next.state = SessionState.CITA_AWAITING_DISTRITO_AI;
    return buildResult(next, [
      sendText(ASK_OTHER_DISTRITO_TEXT),
    ]);
  }

  if (tapped === OtherDistritoButtonId.NO || answer === Confirmation.NO) {
    return buildResult({ state: SessionState.CITA_NO_COVERAGE_CLOSED, slots: {}, counters: {} }, [sendText(CITA_FAREWELL_TEXT)]);
  }

  if (typed && looksLikePlaceName(typed)) {
    const next = cloneSession(session);
    next.slots = DISTRICT_BOUND_SLOTS.reduce(omitSlot, next.slots);
    return resolveDistritoText(next, typed, undefined);
  }

  return withNote(buildResult(session, [questionButtons(OTHER_DISTRITO_QUESTION_TEXT)]), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "other_distrito" },
  });
}
