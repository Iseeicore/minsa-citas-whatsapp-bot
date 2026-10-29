import { buildResult, cloneSession, query } from "@/lib/fsm/core/handlers-shared";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { tipoDocumentoDe } from "@/lib/fsm/parsing/text/identity-format";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

export function startReferenciasLookup(session: Session): HandlerResult {
  const next = cloneSession(session);
  delete next.slots[SlotKey.CITA_REFERENCIAS_SIN_PROGRAMACION];
  delete next.slots[SlotKey.CITA_REFERENCIAS_DATA];
  delete next.slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID];
  delete next.slots[SlotKey.CITA_OFFERED];
  delete next.slots[SlotKey.CITA_OFFERED_NAMES];
  next.state = SessionState.REFERENCIA_LOOKUP_PENDING;
  const numeroDocumento = slotText(next.slots, SlotKey.CITA_DNI);
  return buildResult(next, [query(QueryKind.LIST_REFERENCES, { numeroDocumento, tipoDocumento: tipoDocumentoDe(numeroDocumento) })]);
}
