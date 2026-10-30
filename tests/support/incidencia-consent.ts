import { handle } from "@/lib/fsm/core/handlers";
import type { HandlerResult, QueryResultEvent } from "@/lib/fsm/core/types";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";

const FROM = "sandbox-incidencia-consent";

export const consentChecked = (aceptado: boolean, from: string = FROM): QueryResultEvent => ({
  from,
  type: InternalEventType.QUERY_RESULT,
  queryKind: QueryKind.VERIFICAR_CONSENTIMIENTO,
  result: { aceptado },
});

export const consentRegistered = (from: string = FROM): QueryResultEvent => ({
  from,
  type: InternalEventType.QUERY_RESULT,
  queryKind: QueryKind.REGISTRAR_CONSENTIMIENTO,
  result: { ok: true },
});

export function answerConsent(
  begun: HandlerResult,
  { aceptado = true, from = FROM }: { aceptado?: boolean; from?: string } = {},
): HandlerResult {
  if (begun.session.state !== SessionState.INCIDENCIA_CONSENT_CHECK_PENDING) return begun;
  const checked = handle(begun.session, consentChecked(aceptado, from));
  if (aceptado) return checked;
  const tapped = handle(checked.session, { from, type: InboundEventType.BUTTON, listId: IncidenciaButtonId.CONSENT_SI });
  return handle(tapped.session, consentRegistered(from));
}
