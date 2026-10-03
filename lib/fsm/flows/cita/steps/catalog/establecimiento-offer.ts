import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { buildResult, offerPagedList, query, sendText } from "@/lib/fsm/core/handlers-shared";
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
  return buildResult(next, offerPagedList(next, "Selecciona el establecimiento:", establecimientoRows(items)));
}
