import { cloneSession } from "@/lib/fsm/core/handlers-shared";
import { slotText } from "@/lib/fsm/core/slot-readers";
import type { HandlerResult, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { closeConsulta } from "@/lib/fsm/flows/consulta/cierre";
import { acceptCodigo, askTipo } from "@/lib/fsm/flows/consulta/codigo";
import { logger } from "@/lib/observability/logger";
import { CONSULTA_FALLA_TEXT, LIMITE_DIARIO_TEXT } from "@/lib/constants/textos/consulta";
import { MAX_CONSULTAS_POR_DIA } from "@/lib/constants/limits/consulta";
import { CupoDiarioStatus } from "@/lib/enums/cupo-diario-status";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import type { CountIntentosDelDiaResult } from "@/lib/types/cupo-diario.types";

export function handleCupoPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as CountIntentosDelDiaResult | undefined;
  if (result?.statusCupo !== CupoDiarioStatus.COUNTED) return closeConsulta(SessionState.CONSULTA_FAILED, CONSULTA_FALLA_TEXT);
  if (result.total >= MAX_CONSULTAS_POR_DIA) {
    logger.warn("consulta.daily_limit", { canal: slotText(session.slots, SlotKey.CONSULTA_CANAL) });
    return closeConsulta(SessionState.CONSULTA_FAILED, LIMITE_DIARIO_TEXT);
  }

  const next = cloneSession(session);
  next.slots[SlotKey.CONSULTA_USADAS_HOY] = result.total;
  const codigo = next.slots[SlotKey.CONSULTA_CODIGO];
  return codigo ? acceptCodigo(next, codigo) : askTipo(next);
}
