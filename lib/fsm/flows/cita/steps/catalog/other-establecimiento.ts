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
import { QueryKind } from "@/lib/enums/query-kind";
import { SearchSubject } from "@/lib/enums/search-subject";

export const OTHER_ESTABLECIMIENTO_STATE = "cita_awaiting_other_establecimiento";
export const DISCARDED_ESTABLECIMIENTOS_SLOT = "citaEstablecimientosDescartados";
export const ESTABLECIMIENTO_NAME_SLOT = "citaEstablecimientoNombre";

const WITHOUT_DATES_SLOT = "citaEstablecimientoSinFechas";
const PROPOSED_ID_SLOT = "citaEstablecimientoPropuesto";
const PROPOSED_NAME_SLOT = "citaEstablecimientoPropuestoNombre";

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
  return String(slots[DISCARDED_ESTABLECIMIENTOS_SLOT] ?? "")
    .split(",")
    .filter(Boolean);
}

export function isSearchingOtherEstablecimiento(slots: Session["slots"]): boolean {
  return WITHOUT_DATES_SLOT in slots;
}

export function searchOtherEstablecimiento(session: Session): HandlerResult {
  const next = cloneSession(session);
  const empty = String(next.slots.citaCodEess ?? "");
  const discarded = empty ? [...new Set([...discardedEstablecimientos(next.slots), empty])] : discardedEstablecimientos(next.slots);
  if (discarded.length > 0) next.slots[DISCARDED_ESTABLECIMIENTOS_SLOT] = discarded.join(",");

  next.slots[WITHOUT_DATES_SLOT] = String(next.slots[ESTABLECIMIENTO_NAME_SLOT] ?? "");
  delete next.slots.citaCodEess;
  delete next.slots[ESTABLECIMIENTO_NAME_SLOT];
  next.state = "cita_establecimiento_pending";

  return withNote(
    buildResult(next, [
      query(QueryKind.LIST_ESTABLECIMIENTOS, {
        especialidadId: String(next.slots.citaEspecialidadId ?? ""),
        ubigeo: String(next.slots.citaUbigeo ?? ""),
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
  const emptyName = String(next.slots[WITHOUT_DATES_SLOT] ?? "");
  delete next.slots[WITHOUT_DATES_SLOT];
  const where = emptyName ? `*${emptyName}*` : "ese establecimiento";

  if (remaining.length === 0) return offerOtherDistrito(next, SearchSubject.ESTABLECIMIENTOS);

  if (remaining.length === 1) {
    const [proposed] = remaining;
    next.slots[PROPOSED_ID_SLOT] = proposed.id;
    next.slots[PROPOSED_NAME_SLOT] = proposed.name;
    next.state = OTHER_ESTABLECIMIENTO_STATE;
    return buildResult(next, [questionButtons(`No hay fechas disponibles en ${where}. ${question(proposed.name)}`)]);
  }

  const especialidad = next.slots.citaEspecialidadNombre ? `*${String(next.slots.citaEspecialidadNombre)}*` : "esa especialidad";
  next.state = "cita_awaiting_establecimiento_select";
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
    const proposed = String(next.slots[PROPOSED_ID_SLOT] ?? "");
    next.slots.citaCodEess = proposed;
    next.slots[ESTABLECIMIENTO_NAME_SLOT] = String(next.slots[PROPOSED_NAME_SLOT] ?? "");
    delete next.slots[PROPOSED_ID_SLOT];
    delete next.slots[PROPOSED_NAME_SLOT];
    next.state = "cita_fecha_pending";
    return buildResult(next, [
      sendText("Buscando fechas disponibles…"),
      query(QueryKind.LIST_FECHAS, {
        codEess: proposed,
        especialidadId: String(next.slots.citaEspecialidadId ?? ""),
      }),
    ]);
  }

  if (tapped === NO_ID || answer === Confirmation.NO) {
    return withNote(buildResult({ state: DECLINED_CLOSED_STATE, slots: {}, counters: {} }, [sendText(FAREWELL)]), {
      kind: "cita_closed",
      detail: { reason: "no_other_establecimiento" },
    });
  }

  return withNote(buildResult(session, [questionButtons(question(String(session.slots[PROPOSED_NAME_SLOT] ?? "")))]), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "other_establecimiento" },
  });
}
