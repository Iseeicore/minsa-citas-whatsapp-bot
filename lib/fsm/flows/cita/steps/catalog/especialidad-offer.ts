import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { buildResult, offerPagedList, query, sendText } from "@/lib/fsm/core/handlers-shared";
import { catalogRowDescription, formatEspecialidadName, rememberFullNames } from "@/lib/fsm/flows/cita/data/catalog-names";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import type { HandlerResult, ListRow, Session } from "@/lib/fsm/core/types";

export type EspecialidadResultItem = {
  codigoEspecialidad: string;
  nombreEspecialidad: string;
  cantidadCupos: number;
};

/** Devuelve la única especialidad que coincide con el texto sugerido, o undefined si hay cero o varias. */
export function matchEspecialidadHint(
  hint: string,
  items: EspecialidadResultItem[],
): EspecialidadResultItem | undefined {
  const hintTokens = normalizeText(hint);
  const matches = items.filter(
    (item) =>
      normalizeText(item.nombreEspecialidad).includes(hintTokens) ||
      hintTokens.includes(normalizeText(item.nombreEspecialidad)),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function acceptDetectedEspecialidad(next: Session, matched: EspecialidadResultItem): HandlerResult {
  const name = formatEspecialidadName(matched.nombreEspecialidad);
  delete next.slots[SlotKey.CITA_ESPECIALIDAD_HINT_TEXT];
  next.slots[SlotKey.CITA_ESPECIALIDAD_ID] = matched.codigoEspecialidad;
  next.slots[SlotKey.CITA_ESPECIALIDAD_NOMBRE] = name.full;
  next.state = SessionState.CITA_ESTABLECIMIENTO_PENDING;
  return buildResult(next, [
    sendText(`Especialidad detectada: ${name.full}. Buscando establecimientos…`),
    query(QueryKind.LIST_ESTABLECIMIENTOS, {
      especialidadId: matched.codigoEspecialidad,
      ubigeo: String(next.slots[SlotKey.CITA_UBIGEO] ?? ""),
    }),
  ]);
}

export function offerEspecialidades(next: Session, items: EspecialidadResultItem[]): HandlerResult {
  next.state = SessionState.CITA_AWAITING_ESPECIALIDAD_SELECT;
  const names = items.map((item) => ({ id: item.codigoEspecialidad, name: formatEspecialidadName(item.nombreEspecialidad) }));
  rememberFullNames(next.slots, names.map(({ id, name }) => ({ id, full: name.full })));
  const rows: ListRow[] = items.map((item, index) => {
    const { name } = names[index];
    return { id: item.codigoEspecialidad, title: name.title, description: catalogRowDescription(name, item.cantidadCupos) };
  });
  return buildResult(next, offerPagedList(next, "Selecciona la especialidad:", rows));
}
