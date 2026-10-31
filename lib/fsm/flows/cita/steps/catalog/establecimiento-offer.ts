import { z } from "zod";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { buildResult, offerPagedList, query, sendButtons, sendText } from "@/lib/fsm/core/handlers-shared";
import { CounterKey } from "@/lib/enums/counter-key";
import { EstablecimientoPageRowId } from "@/lib/enums/establecimiento-page-row-id";
import { catalogRowDescription, formatEstablecimientoName } from "@/lib/fsm/flows/cita/data/catalog-names";
import { matchAllTokens } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, ListRow, Session } from "@/lib/fsm/core/types";
import {
  ESTABLECIMIENTO_CONFIRM_BUTTONS,
  ESTABLECIMIENTO_DETECTED_LABEL_TEXT,
  ESTABLECIMIENTO_PAGE_PREV_TITLE_TEXT,
  ESTABLECIMIENTO_PAGE_NEXT_TITLE_TEXT,
  establecimientoChosenText,
  establecimientoConfirmText,
  ESTABLECIMIENTOS_FOUND_TEXT,
  SELECT_ESTABLECIMIENTO_TEXT,
} from "@/lib/constants/textos/cita-catalogo";
import { readSlotJson, slotText } from "@/lib/fsm/core/slot-readers";
import { SlotJsonStatus } from "@/lib/enums/slot-json-status";

export type EstablecimientoResultItem = {
  renipressCode: string;
  establishmentName: string;
  quotasOnline: number;
};

const HELD_ESTABLECIMIENTOS_SCHEMA = z.object({
  page: z.number(),
  items: z.array(z.object({ renipressCode: z.string(), establishmentName: z.string(), quotasOnline: z.number() })),
});

export type HeldEstablecimientos = z.infer<typeof HELD_ESTABLECIMIENTOS_SCHEMA>;

export function establecimientoRows(items: EstablecimientoResultItem[]): ListRow[] {
  return items.map((item) => {
    const name = formatEstablecimientoName(item.establishmentName);
    return { id: item.renipressCode, title: name.title, description: catalogRowDescription(name, item.quotasOnline) };
  });
}

export function establecimientoPaging(counters: Session["counters"]): { page: number; totalPages: number } {
  return {
    page: counters[CounterKey.CITA_ESTABLECIMIENTOS_PAGE] ?? 1,
    totalPages: counters[CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES] ?? 1,
  };
}

export function hasPreviousEstablecimientos(counters: Session["counters"]): boolean {
  const { page } = establecimientoPaging(counters);
  return page > (counters[CounterKey.CITA_ESTABLECIMIENTOS_FIRST_PAGE] ?? page);
}

export function hasMoreEstablecimientos(counters: Session["counters"]): boolean {
  return counters[CounterKey.CITA_ESTABLECIMIENTOS_NEXT_PAGE] !== undefined;
}

export function establecimientoPageRows(items: EstablecimientoResultItem[], counters: Session["counters"]): ListRow[] {
  const rows = establecimientoRows(items);
  if (hasPreviousEstablecimientos(counters)) rows.push({ id: EstablecimientoPageRowId.PREV, title: ESTABLECIMIENTO_PAGE_PREV_TITLE_TEXT });
  if (hasMoreEstablecimientos(counters)) rows.push({ id: EstablecimientoPageRowId.NEXT, title: ESTABLECIMIENTO_PAGE_NEXT_TITLE_TEXT });
  return rows;
}

export function forgetEstablecimientoPaging(next: Session): void {
  delete next.counters[CounterKey.CITA_ESTABLECIMIENTOS_FIRST_PAGE];
  delete next.counters[CounterKey.CITA_ESTABLECIMIENTOS_NEXT_PAGE];
  delete next.slots[SlotKey.CITA_ESTABLECIMIENTOS_RETENIDOS];
}

export function readHeldEstablecimientos(slots: Session["slots"]): HeldEstablecimientos | undefined {
  const held = readSlotJson(slots, SlotKey.CITA_ESTABLECIMIENTOS_RETENIDOS, HELD_ESTABLECIMIENTOS_SCHEMA);
  return held.status === SlotJsonStatus.OK ? held.value : undefined;
}

export function holdEstablecimientos(next: Session, held: HeldEstablecimientos): void {
  next.slots[SlotKey.CITA_ESTABLECIMIENTOS_RETENIDOS] = JSON.stringify(held);
}

export function searchEstablecimientosPage(next: Session, page: number, announcement?: string): HandlerResult {
  next.counters[CounterKey.CITA_ESTABLECIMIENTOS_PAGE] = page;
  next.state = SessionState.CITA_ESTABLECIMIENTO_PENDING;
  const search = query(QueryKind.LIST_ESTABLECIMIENTOS, {
    especialidadId: slotText(next.slots, SlotKey.CITA_ESPECIALIDAD_ID),
    ubigeo: slotText(next.slots, SlotKey.CITA_UBIGEO),
    page,
  });
  return buildResult(next, announcement ? [sendText(announcement), search] : [search]);
}

export const establecimientoFullName = (item: EstablecimientoResultItem): string => formatEstablecimientoName(item.establishmentName).full;

export function detectEstablecimiento(hint: string | undefined, items: EstablecimientoResultItem[]): EstablecimientoResultItem | undefined {
  if (!hint) return undefined;
  const matched = matchAllTokens(
    hint,
    items.map((item) => ({ id: item.renipressCode, title: item.establishmentName })),
  );
  return matched ? items.find((item) => item.renipressCode === matched.id) : undefined;
}

export function chooseEstablecimiento(next: Session, item: EstablecimientoResultItem): HandlerResult {
  next.slots[SlotKey.CITA_COD_EESS] = item.renipressCode;
  next.slots[SlotKey.CITA_ESTABLECIMIENTO_NOMBRE] = establecimientoFullName(item);
  next.state = SessionState.CITA_FECHA_PENDING;
  return buildResult(next, [
    sendText(establecimientoChosenText(ESTABLECIMIENTO_DETECTED_LABEL_TEXT, establecimientoFullName(item))),
    query(QueryKind.LIST_FECHAS, {
      codEess: item.renipressCode,
      especialidadId: slotText(next.slots, SlotKey.CITA_ESPECIALIDAD_ID),
    }),
  ]);
}

export function offerEstablecimientos(next: Session, items: EstablecimientoResultItem[]): HandlerResult {
  next.state = SessionState.CITA_AWAITING_ESTABLECIMIENTO_SELECT;
  const text = hasPreviousEstablecimientos(next.counters) ? SELECT_ESTABLECIMIENTO_TEXT : ESTABLECIMIENTOS_FOUND_TEXT;
  return buildResult(next, offerPagedList(next, text, establecimientoPageRows(items, next.counters)));
}

export function reshowEstablecimientoConfirm(session: Session): HandlerResult {
  const nombre = slotText(session.slots, SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE);
  return buildResult(session, [sendButtons(establecimientoConfirmText(nombre), ESTABLECIMIENTO_CONFIRM_BUTTONS)]);
}

export function proposeEstablecimiento(next: Session, item: EstablecimientoResultItem): HandlerResult {
  const { slots } = next;

  slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO] = item.renipressCode;
  slots[SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE] = establecimientoFullName(item);
  next.state = SessionState.CITA_AWAITING_ESTABLECIMIENTO_CONFIRM;

  return reshowEstablecimientoConfirm(next);
}
