import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { buildResult, offerPagedList, query, sendText } from "@/lib/fsm/core/handlers-shared";
import { CounterKey } from "@/lib/enums/counter-key";
import { EstablecimientoPageRowId } from "@/lib/enums/establecimiento-page-row-id";
import { catalogRowDescription, formatEstablecimientoName } from "@/lib/fsm/flows/cita/data/catalog-names";
import { matchAllTokens } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, ListRow, Session } from "@/lib/fsm/core/types";

export type EstablecimientoResultItem = {
  renipressCode: string;
  establishmentName: string;
  quotasOnline: number;
};

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

/** Filas de la página actual; si el MINSA tiene más páginas, agrega las filas «Ver anteriores» y «Ver más establecimientos». */
export function establecimientoPageRows(items: EstablecimientoResultItem[], counters: Session["counters"]): ListRow[] {
  const { page, totalPages } = establecimientoPaging(counters);
  const rows = establecimientoRows(items);
  if (page > 1) {
    rows.push({ id: EstablecimientoPageRowId.PREV, title: "Ver anteriores", description: `Página ${page - 1} de ${totalPages}` });
  }
  if (page < totalPages) {
    rows.push({ id: EstablecimientoPageRowId.NEXT, title: "Ver más establecimientos", description: `Página ${page + 1} de ${totalPages}` });
  }
  return rows;
}

export function searchEstablecimientosPage(next: Session, page: number, announcement?: string): HandlerResult {
  next.counters[CounterKey.CITA_ESTABLECIMIENTOS_PAGE] = page;
  next.state = SessionState.CITA_ESTABLECIMIENTO_PENDING;
  const search = query(QueryKind.LIST_ESTABLECIMIENTOS, {
    especialidadId: String(next.slots[SlotKey.CITA_ESPECIALIDAD_ID] ?? ""),
    ubigeo: String(next.slots[SlotKey.CITA_UBIGEO] ?? ""),
    page,
  });
  return buildResult(next, announcement ? [sendText(announcement), search] : [search]);
}

export const establecimientoFullName = (item: EstablecimientoResultItem): string =>
  formatEstablecimientoName(item.establishmentName).full;

/** Devuelve el establecimiento que coincide con el texto sugerido, o undefined si no hay coincidencia. */
export function detectEstablecimiento(
  hint: string | undefined,
  items: EstablecimientoResultItem[],
): EstablecimientoResultItem | undefined {
  if (!hint) return undefined;
  const matched = matchAllTokens(
    hint,
    items.map((item) => ({ id: item.renipressCode, title: item.establishmentName })),
  );
  return matched ? items.find((item) => item.renipressCode === matched.id) : undefined;
}

export function chooseEstablecimiento(
  next: Session,
  item: EstablecimientoResultItem,
  label: "encontrado" | "detectado",
): HandlerResult {
  next.slots[SlotKey.CITA_COD_EESS] = item.renipressCode;
  next.slots[SlotKey.CITA_ESTABLECIMIENTO_NOMBRE] = establecimientoFullName(item);
  next.state = SessionState.CITA_FECHA_PENDING;
  return buildResult(next, [
    sendText(`Establecimiento ${label}: ${establecimientoFullName(item)}. Buscando fechas disponibles…`),
    query(QueryKind.LIST_FECHAS, {
      codEess: item.renipressCode,
      especialidadId: String(next.slots[SlotKey.CITA_ESPECIALIDAD_ID] ?? ""),
    }),
  ]);
}

export function offerEstablecimientos(next: Session, items: EstablecimientoResultItem[]): HandlerResult {
  next.state = SessionState.CITA_AWAITING_ESTABLECIMIENTO_SELECT;
  return buildResult(next, offerPagedList(next, "Selecciona el establecimiento:", establecimientoPageRows(items, next.counters)));
}
