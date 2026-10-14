import { buildResult, cloneSession, query, sendText } from "@/lib/fsm/core/handlers-shared";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { tipoDocumentoDe } from "@/lib/fsm/parsing/text/identity-format";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { ANALYZING_CUENTA_TEXT } from "@/lib/constants/textos/cita-identidad";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

export function startReferenciasLookup(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.REFERENCIA_LOOKUP_PENDING;
  const numeroDocumento = slotText(next.slots, SlotKey.CITA_DNI);
  return buildResult(next, [
    sendText(ANALYZING_CUENTA_TEXT),
    query(QueryKind.LIST_REFERENCES, { numeroDocumento, tipoDocumento: tipoDocumentoDe(numeroDocumento) }),
  ]);
}
