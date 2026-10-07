import { normalizeText, toDisplayPlace } from "@/lib/fsm/parsing/text/text";
import {
  buildResult,
  offerList,
  query,
  sendText,
  truncateForRow,
  WHATSAPP_LIST_MAX_ROWS,
  WHATSAPP_ROW_DESCRIPTION_MAX,
  WHATSAPP_ROW_TITLE_MAX,
} from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, ListRow, Session } from "@/lib/fsm/core/types";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

export type UbigeoResultItem = {
  ubigeoInei: string;
  distrito: string;
  provincia: string;
  departamento: string;
};

/** Devuelve el ubigeo único: el único resultado, o el que coincide exactamente con distrito, provincia y departamento ya conocidos. */
export function pickSettledUbigeo(session: Session, items: UbigeoResultItem[]): UbigeoResultItem | undefined {
  if (items.length === 1) return items[0];

  const same = (found: string, known: unknown) =>
    typeof known !== "string" || known === "" || normalizeText(found) === normalizeText(known);
  const exact = items.filter(
    (item) =>
      typeof session.slots[SlotKey.CITA_DISTRITO] === "string" &&
      normalizeText(item.distrito) === normalizeText(session.slots[SlotKey.CITA_DISTRITO]) &&
      same(item.provincia, session.slots[SlotKey.CITA_PROVINCIA]) &&
      same(item.departamento, session.slots[SlotKey.CITA_DEPARTAMENTO]),
  );
  return exact.length === 1 ? exact[0] : undefined;
}

export const searchingCatalogText = (distrito: string) =>
  `Entendido. Buscando especialidades y citas disponibles en *${toDisplayPlace(distrito)}*…`;

export function ubigeoRows(items: UbigeoResultItem[]): ListRow[] {
  return items.map((item) => ({
    id: item.ubigeoInei,
    title: truncateForRow(item.distrito, WHATSAPP_ROW_TITLE_MAX),
    description: truncateForRow(`${item.provincia} — ${item.departamento}`, WHATSAPP_ROW_DESCRIPTION_MAX),
  }));
}

export const isOfferableUbigeoList = (items: UbigeoResultItem[]): boolean =>
  items.length > 1 && items.length <= WHATSAPP_LIST_MAX_ROWS;

export function acceptSettledUbigeo(next: Session, settled: UbigeoResultItem): HandlerResult {
  next.slots[SlotKey.CITA_UBIGEO] = settled.ubigeoInei;
  next.state = SessionState.CITA_ESPECIALIDAD_PENDING;
  return buildResult(next, [
    sendText(searchingCatalogText(settled.distrito)),
    query(QueryKind.LIST_ESPECIALIDADES, { ubigeo: settled.ubigeoInei }),
  ]);
}

export function offerUbigeos(next: Session, items: UbigeoResultItem[]): HandlerResult {
  next.state = SessionState.CITA_AWAITING_UBIGEO_SELECT;
  return buildResult(next, [offerList(next, "Selecciona tu ubigeo:", ubigeoRows(items))]);
}
