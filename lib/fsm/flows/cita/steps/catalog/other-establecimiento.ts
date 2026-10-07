import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import {
  buildResult,
  cloneSession,
  offerPagedList,
  query,
  sendButtons,
  sendText,
  withNote,
} from "@/lib/fsm/core/handlers-shared";
import { DECLINED_CLOSED_STATE, FAREWELL } from "@/lib/fsm/flows/cita/steps/fecha/other-fecha";
import { offerOtherDistrito } from "@/lib/fsm/flows/cita/steps/catalog/no-coverage";
import type { HandlerResult, InboundEvent, ListRow, Session } from "@/lib/fsm/core/types";
import { OtherEstablecimientoButtonId } from "@/lib/enums/other-establecimiento-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { CounterKey } from "@/lib/enums/counter-key";
import { QueryKind } from "@/lib/enums/query-kind";
import { SearchSubject } from "@/lib/enums/search-subject";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

export const OTHER_ESTABLECIMIENTO_STATE = SessionState.CITA_AWAITING_OTHER_ESTABLECIMIENTO;


const YES_ID = OtherEstablecimientoButtonId.YES;
const NO_ID = OtherEstablecimientoButtonId.NO;

export type AlternativeEstablecimiento = { id: string; name: string };

const question = (proposed: string) => `¿Quieres buscar en *${proposed}*?`;

const questionButtons = (text: string) =>
  sendButtons(text, [
    { id: YES_ID, title: "Sí, buscar ahí" },
    { id: NO_ID, title: "No, salir" },
  ]);

export function discardedEstablecimientos(slots: Session["slots"]): string[] {
  return String(slots[SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS] ?? "")
    .split(",")
    .filter(Boolean);
}

export function isSearchingOtherEstablecimiento(slots: Session["slots"]): boolean {
  return SlotKey.CITA_ESTABLECIMIENTO_SIN_FECHAS in slots;
}

export function searchOtherEstablecimiento(session: Session): HandlerResult {
  const next = cloneSession(session);
  const empty = String(next.slots[SlotKey.CITA_COD_EESS] ?? "");
  const discarded = empty ? [...new Set([...discardedEstablecimientos(next.slots), empty])] : discardedEstablecimientos(next.slots);
  if (discarded.length > 0) next.slots[SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS] = discarded.join(",");

  next.slots[SlotKey.CITA_ESTABLECIMIENTO_SIN_FECHAS] = String(next.slots[SlotKey.CITA_ESTABLECIMIENTO_NOMBRE] ?? "");
  delete next.slots[SlotKey.CITA_COD_EESS];
  delete next.slots[SlotKey.CITA_ESTABLECIMIENTO_NOMBRE];
  next.state = SessionState.CITA_ESTABLECIMIENTO_PENDING;

  return withNote(
    buildResult(next, [
      query(QueryKind.LIST_ESTABLECIMIENTOS, {
        especialidadId: String(next.slots[SlotKey.CITA_ESPECIALIDAD_ID] ?? ""),
        ubigeo: String(next.slots[SlotKey.CITA_UBIGEO] ?? ""),
        page: next.counters[CounterKey.CITA_ESTABLECIMIENTOS_PAGE] ?? 1,
      }),
    ]),
    { kind: "no_coverage", level: "warn", detail: { missing: SearchSubject.FECHAS, discarded: discarded.length } },
  );
}

export function offerOtherEstablecimiento(
  session: Session,
  remaining: AlternativeEstablecimiento[],
  rows: ListRow[],
): HandlerResult {
  const next = cloneSession(session);
  const emptyName = String(next.slots[SlotKey.CITA_ESTABLECIMIENTO_SIN_FECHAS] ?? "");
  delete next.slots[SlotKey.CITA_ESTABLECIMIENTO_SIN_FECHAS];
  const where = emptyName ? `*${emptyName}*` : "ese establecimiento";

  if (remaining.length === 0) return offerOtherDistrito(next, SearchSubject.ESTABLECIMIENTOS);

  if (remaining.length === 1) {
    const [proposed] = remaining;
    next.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO] = proposed.id;
    next.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE] = proposed.name;
    next.state = OTHER_ESTABLECIMIENTO_STATE;
    return buildResult(next, [questionButtons(`No hay fechas disponibles en ${where}. ${question(proposed.name)}`)]);
  }

  const especialidad = next.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE] ? `*${String(next.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE])}*` : "esa especialidad";
  next.state = SessionState.CITA_AWAITING_ESTABLECIMIENTO_SELECT;
  return buildResult(next, [
    sendText(`No hay fechas disponibles en ${where}. Estos establecimientos también atienden ${especialidad}:`),
    ...offerPagedList(next, "Selecciona el establecimiento:", rows),
  ]);
}

export function handleOtherEstablecimiento(session: Session, event: InboundEvent): HandlerResult {
  const tapped =
    event.type === InboundEventType.BUTTON || event.type === InboundEventType.LIST ? event.listId : undefined;
  const answer = resolveConfirmation(event.type === InboundEventType.TEXT ? (event.text ?? "") : "");

  if (tapped === YES_ID || answer === Confirmation.YES) {
    const next = cloneSession(session);
    const proposed = String(next.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO] ?? "");
    next.slots[SlotKey.CITA_COD_EESS] = proposed;
    next.slots[SlotKey.CITA_ESTABLECIMIENTO_NOMBRE] = String(next.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE] ?? "");
    delete next.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO];
    delete next.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE];
    next.state = SessionState.CITA_FECHA_PENDING;
    return buildResult(next, [
      sendText("Buscando fechas disponibles…"),
      query(QueryKind.LIST_FECHAS, {
        codEess: proposed,
        especialidadId: String(next.slots[SlotKey.CITA_ESPECIALIDAD_ID] ?? ""),
      }),
    ]);
  }

  if (tapped === NO_ID || answer === Confirmation.NO) {
    return withNote(buildResult({ state: DECLINED_CLOSED_STATE, slots: {}, counters: {} }, [sendText(FAREWELL)]), {
      kind: "cita_closed",
      detail: { reason: "no_other_establecimiento" },
    });
  }

  return withNote(buildResult(session, [questionButtons(question(String(session.slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE] ?? "")))]), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "other_establecimiento" },
  });
}
