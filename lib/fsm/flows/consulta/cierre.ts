import { buildResult, cloneSession, query, sendText } from "@/lib/fsm/core/handlers-shared";
import { slotText } from "@/lib/fsm/core/slot-readers";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { ConsultaPayloadKey } from "@/lib/enums/consulta-payload-key";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

export function closeConsulta(state: SessionState.CONSULTA_COMPLETED | SessionState.CONSULTA_FAILED, text?: string): HandlerResult {
  return buildResult({ state, slots: {}, counters: {} }, text ? [sendText(text)] : []);
}

export function closeExhausted(session: Session, text: string): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.CONSULTA_INTENTO_PENDING;
  return buildResult(next, [
    sendText(text),
    query(QueryKind.CONSULTA_REINTENTOS_AGOTADOS, { [ConsultaPayloadKey.CANAL]: slotText(next.slots, SlotKey.CONSULTA_CANAL) }),
  ]);
}
