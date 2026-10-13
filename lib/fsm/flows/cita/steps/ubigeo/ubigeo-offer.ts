import { normalizeText, toDisplayPlace } from "@/lib/fsm/parsing/text/text";
import { buildResult, offerList, query, sendText, truncateForRow } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, ListRow, Session } from "@/lib/fsm/core/types";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { searchingCatalogInText, SELECT_UBIGEO_TEXT } from "@/lib/constants/textos/cita-ubicacion";
import { isString } from "@/lib/utils/type-guards";
import { WHATSAPP_ROW_TITLE_MAX, WHATSAPP_ROW_DESCRIPTION_MAX, WHATSAPP_LIST_MAX_ROWS } from "@/lib/constants/limits/whatsapp";

export type UbigeoResultItem = {
  ubigeoInei: string;
  distrito: string;
  provincia: string;
  departamento: string;
};

export function pickSettledUbigeo(session: Session, items: UbigeoResultItem[]): UbigeoResultItem | undefined {
  if (items.length === 1) return items[0];

  const same = (found: string, known: unknown) => !isString(known) || known === "" || normalizeText(found) === normalizeText(known);
  const exact = items.filter(
    (item) =>
      isString(session.slots[SlotKey.CITA_DISTRITO]) &&
      normalizeText(item.distrito) === normalizeText(session.slots[SlotKey.CITA_DISTRITO]) &&
      same(item.provincia, session.slots[SlotKey.CITA_PROVINCIA]) &&
      same(item.departamento, session.slots[SlotKey.CITA_DEPARTAMENTO]),
  );
  return exact.length === 1 ? exact[0] : undefined;
}

export const searchingCatalogText = (distrito: string) => searchingCatalogInText(toDisplayPlace(distrito));

export function ubigeoRows(items: UbigeoResultItem[]): ListRow[] {
  return items.map((item) => ({
    id: item.ubigeoInei,
    title: truncateForRow(item.distrito, WHATSAPP_ROW_TITLE_MAX),
    description: truncateForRow(`${item.provincia} — ${item.departamento}`, WHATSAPP_ROW_DESCRIPTION_MAX),
  }));
}

export const isOfferableUbigeoList = (items: UbigeoResultItem[]): boolean => items.length > 1 && items.length <= WHATSAPP_LIST_MAX_ROWS;

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
  return buildResult(next, [offerList(next, SELECT_UBIGEO_TEXT, ubigeoRows(items))]);
}
