import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import {
  buildResult,
  cloneSession,
  offerPagedList,
  query,
  sendButtons,
  sendText,
  withNote,
  readTappedId,
  readTypedText,
} from "@/lib/fsm/core/handlers-shared";
import { offerOtherDistrito } from "@/lib/fsm/flows/cita/steps/catalog/no-coverage";
import type { HandlerResult, InboundEvent, ListRow, Session } from "@/lib/fsm/core/types";
import { OtherEstablecimientoButtonId } from "@/lib/enums/other-establecimiento-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { CounterKey } from "@/lib/enums/counter-key";
import { QueryKind } from "@/lib/enums/query-kind";
import { SearchSubject } from "@/lib/enums/search-subject";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { CITA_FAREWELL_TEXT } from "@/lib/constants/textos/cita-salida";
import { SEARCHING_FECHAS_TEXT } from "@/lib/constants/textos/cita-fecha-hora";
import {
  SELECT_ESTABLECIMIENTO_TEXT,
  otherEstablecimientoQuestionText,
  noFechasProposeText,
  noFechasAlternativesText,
  THAT_ESTABLECIMIENTO_TEXT,
  THAT_ESPECIALIDAD_TEXT,
  OTHER_ESTABLECIMIENTO_BUTTONS,
} from "@/lib/constants/textos/cita-catalogo";
import { slotText } from "@/lib/fsm/core/slot-readers";

export type AlternativeEstablecimiento = { id: string; name: string };

const questionButtons = (text: string) => sendButtons(text, OTHER_ESTABLECIMIENTO_BUTTONS);

export function discardedEstablecimientos(slots: Session["slots"]): string[] {
  return slotText(slots, SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS).split(",").filter(Boolean);
}

export function isSearchingOtherEstablecimiento(slots: Session["slots"]): boolean {
  return SlotKey.CITA_ESTABLECIMIENTO_SIN_FECHAS in slots;
}

export function searchOtherEstablecimiento(session: Session): HandlerResult {
  const next = cloneSession(session);
  const empty = slotText(next.slots, SlotKey.CITA_COD_EESS);
  const discarded = empty ? [...new Set([...discardedEstablecimientos(next.slots), empty])] : discardedEstablecimientos(next.slots);
  if (discarded.length > 0) next.slots[SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS] = discarded.join(",");

  next.slots[SlotKey.CITA_ESTABLECIMIENTO_SIN_FECHAS] = slotText(next.slots, SlotKey.CITA_ESTABLECIMIENTO_NOMBRE);
  delete next.slots[SlotKey.CITA_COD_EESS];
  delete next.slots[SlotKey.CITA_ESTABLECIMIENTO_NOMBRE];
  next.state = SessionState.CITA_ESTABLECIMIENTO_PENDING;

  return withNote(
    buildResult(next, [
      query(QueryKind.LIST_ESTABLECIMIENTOS, {
        especialidadId: slotText(next.slots, SlotKey.CITA_ESPECIALIDAD_ID),
        ubigeo: slotText(next.slots, SlotKey.CITA_UBIGEO),
        page: next.counters[CounterKey.CITA_ESTABLECIMIENTOS_PAGE] ?? 1,
      }),
    ]),
    { kind: "no_coverage", level: "warn", detail: { missing: SearchSubject.FECHAS, discarded: discarded.length } },
  );
}

export function offerOtherEstablecimiento(session: Session, remaining: AlternativeEstablecimiento[], rows: ListRow[]): HandlerResult {
  const next = cloneSession(session);
  const emptyName = slotText(next.slots, SlotKey.CITA_ESTABLECIMIENTO_SIN_FECHAS);
  delete next.slots[SlotKey.CITA_ESTABLECIMIENTO_SIN_FECHAS];
  const where = emptyName ? `*${emptyName}*` : THAT_ESTABLECIMIENTO_TEXT;

  if (remaining.length === 0) return offerOtherDistrito(next, SearchSubject.ESTABLECIMIENTOS);

  if (remaining.length === 1) {
    const [proposed] = remaining;
    next.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO] = proposed.id;
    next.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE] = proposed.name;
    next.state = SessionState.CITA_AWAITING_OTHER_ESTABLECIMIENTO;
    return buildResult(next, [questionButtons(noFechasProposeText(where, otherEstablecimientoQuestionText(proposed.name)))]);
  }

  const especialidad = next.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE]
    ? `*${String(next.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE])}*`
    : THAT_ESPECIALIDAD_TEXT;
  next.state = SessionState.CITA_AWAITING_ESTABLECIMIENTO_SELECT;
  return buildResult(next, [
    sendText(noFechasAlternativesText(where, especialidad)),
    ...offerPagedList(next, SELECT_ESTABLECIMIENTO_TEXT, rows),
  ]);
}

export function handleOtherEstablecimiento(session: Session, event: InboundEvent): HandlerResult {
  const tapped = readTappedId(event);
  const answer = resolveConfirmation(readTypedText(event));

  if (tapped === OtherEstablecimientoButtonId.YES || answer === Confirmation.YES) {
    const next = cloneSession(session);
    const proposed = slotText(next.slots, SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO);
    next.slots[SlotKey.CITA_COD_EESS] = proposed;
    next.slots[SlotKey.CITA_ESTABLECIMIENTO_NOMBRE] = slotText(next.slots, SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE);
    delete next.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO];
    delete next.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE];
    next.state = SessionState.CITA_FECHA_PENDING;
    return buildResult(next, [
      sendText(SEARCHING_FECHAS_TEXT),
      query(QueryKind.LIST_FECHAS, {
        codEess: proposed,
        especialidadId: slotText(next.slots, SlotKey.CITA_ESPECIALIDAD_ID),
      }),
    ]);
  }

  if (tapped === OtherEstablecimientoButtonId.NO || answer === Confirmation.NO) {
    return withNote(buildResult({ state: SessionState.CITA_DECLINED_CLOSED, slots: {}, counters: {} }, [sendText(CITA_FAREWELL_TEXT)]), {
      kind: "cita_closed",
      detail: { reason: "no_other_establecimiento" },
    });
  }

  return withNote(
    buildResult(session, [
      questionButtons(otherEstablecimientoQuestionText(slotText(session.slots, SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE))),
    ]),
    {
      kind: "confirmation_unknown",
      level: "warn",
      detail: { step: "other_establecimiento" },
    },
  );
}
