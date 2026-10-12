import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { buildResult, cloneSession, query, sendButtons, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { OfferOtherFechaReason } from "@/lib/enums/offer-other-fecha-reason";
import { OtherFechaButtonId } from "@/lib/enums/other-fecha-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { QueryKind } from "@/lib/enums/query-kind";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import {
  OTHER_FECHA_DECLINED_TEXT,
  OTHER_FECHA_NO_DATES_TEXT,
  REFERENCIA_SIN_CUPOS_TEXT,
  OTHER_FECHA_ONLY_DECLINED_INTRO_TEXT,
  OTHER_FECHA_NO_HORARIOS_INTRO_TEXT,
  OTHER_FECHA_QUESTION_TEXT,
  SEARCHING_OTHER_FECHAS_TEXT,
  OTHER_FECHA_BUTTONS,
} from "@/lib/constants/textos/cita-fecha-hora";
import { CHANGE_DATE_ANSWERS } from "@/lib/constants/palabras-clave";

const DATE_BOUND_SLOTS = [SlotKey.CITA_FECHA, SlotKey.CITA_HORA_CONFIRM_ID, SlotKey.CITA_HORA_CONFIRM_ONLY, SlotKey.CITA_HORAS_DIA, SlotKey.CITA_OFFERED];

const questionButtons = (text: string) =>
  sendButtons(text, OTHER_FECHA_BUTTONS);

export function discardedDates(slots: Session["slots"]): string[] {
  return String(slots[SlotKey.CITA_FECHAS_DESCARTADAS] ?? "")
    .split(",")
    .filter(Boolean);
}

type CloseReason = "declined" | "no_other_dates" | "referencia_sin_cupos";

const CLOSE_TEXT_BY_REASON: Record<CloseReason, string> = {
  declined: OTHER_FECHA_DECLINED_TEXT,
  no_other_dates: OTHER_FECHA_NO_DATES_TEXT,
  referencia_sin_cupos: REFERENCIA_SIN_CUPOS_TEXT,
};

export function closeWithApology(reason: CloseReason): HandlerResult {
  return withNote(
    buildResult({ state: SessionState.CITA_DECLINED_CLOSED, slots: {}, counters: {} }, [sendText(CLOSE_TEXT_BY_REASON[reason])]),
    { kind: "cita_closed", detail: { reason } },
  );
}

export type { OfferOtherFechaReason };

const INTRO_BY_REASON: Record<OfferOtherFechaReason, string> = {
  [OfferOtherFechaReason.ONLY_DECLINED]: OTHER_FECHA_ONLY_DECLINED_INTRO_TEXT,
  [OfferOtherFechaReason.NO_HORARIOS]: OTHER_FECHA_NO_HORARIOS_INTRO_TEXT,
};

const STEP_BY_REASON: Record<OfferOtherFechaReason, string> = {
  [OfferOtherFechaReason.ONLY_DECLINED]: "hora_confirm",
  [OfferOtherFechaReason.NO_HORARIOS]: "hora_pending",
};

export function offerOtherFecha(
  session: Session,
  reason: OfferOtherFechaReason = OfferOtherFechaReason.ONLY_DECLINED,
): HandlerResult {
  const next = cloneSession(session);

  const declined = String(next.slots[SlotKey.CITA_FECHA] ?? "");
  const discarded = declined ? [...new Set([...discardedDates(next.slots), declined])] : discardedDates(next.slots);
  if (discarded.length > 0) next.slots[SlotKey.CITA_FECHAS_DESCARTADAS] = discarded.join(",");

  for (const slot of DATE_BOUND_SLOTS) delete next.slots[slot];
  delete next.counters[CounterKey.CITA_HORA_PAGE];
  next.state = SessionState.CITA_AWAITING_OTHER_FECHA;

  return withNote(buildResult(next, [questionButtons(`${INTRO_BY_REASON[reason]}\n${OTHER_FECHA_QUESTION_TEXT}`)]), {
    kind: "hora_declined",
    detail: {
      step: STEP_BY_REASON[reason],
      only: reason === OfferOtherFechaReason.ONLY_DECLINED,
      declinedDates: discarded.length,
    },
  });
}

export function handleOtherFecha(session: Session, event: InboundEvent): HandlerResult {
  const tapped =
    event.type === InboundEventType.BUTTON || event.type === InboundEventType.LIST ? event.listId : undefined;
  const typed = event.type === InboundEventType.TEXT ? (event.text ?? "") : "";
  const answer = typed && CHANGE_DATE_ANSWERS.has(normalizeText(typed)) ? Confirmation.YES : resolveConfirmation(typed);

  if (tapped === OtherFechaButtonId.YES || answer === Confirmation.YES) {
    const next = cloneSession(session);
    next.state = SessionState.CITA_FECHA_PENDING;
    return buildResult(next, [
      sendText(SEARCHING_OTHER_FECHAS_TEXT),
      query(QueryKind.LIST_FECHAS, {
        codEess: String(next.slots[SlotKey.CITA_COD_EESS] ?? ""),
        especialidadId: String(next.slots[SlotKey.CITA_ESPECIALIDAD_ID] ?? ""),
      }),
    ]);
  }

  if (tapped === OtherFechaButtonId.NO || answer === Confirmation.NO) return closeWithApology("declined");

  return withNote(buildResult(session, [questionButtons(OTHER_FECHA_QUESTION_TEXT)]), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "other_fecha" },
  });
}
