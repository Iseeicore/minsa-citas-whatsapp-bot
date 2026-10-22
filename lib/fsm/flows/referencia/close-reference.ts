import { buildResult, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult } from "@/lib/fsm/core/types";
import { REFERENCIA_GOODBYE_TEXT } from "@/lib/constants/textos/referencia";
import { SessionState } from "@/lib/enums/session-state";

export function closeReferencia(): HandlerResult {
  return buildResult({ state: SessionState.REFERENCIA_CLOSED, slots: {}, counters: {} }, [sendText(REFERENCIA_GOODBYE_TEXT)]);
}
