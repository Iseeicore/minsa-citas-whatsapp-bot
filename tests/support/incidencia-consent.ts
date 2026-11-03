import { handle } from "@/lib/fsm/core/handlers";
import type { HandlerResult, QueryResultEvent } from "@/lib/fsm/core/types";
import { AceptacionTerminosLookup } from "@/lib/enums/consentimiento/aceptacion-terminos-lookup";
import { AceptacionTerminosStatus } from "@/lib/enums/aceptacion-terminos-status";
import { IncidenciaButtonId } from "@/lib/enums/botones/incidencia-button-id";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";

const FROM = "sandbox-incidencia-consent";

export const AUTORIZACION_DENUNCIA_DOCUMENTOS = [{ documento: "DATOS_PERSONALES", version: "2026-11-01" }];

export const CONSULTA_AUTORIZACION_DENUNCIA = {
  kind: QueryKind.CONSULTAR_ACEPTACION_TERMINOS,
  payload: { flujo: "DENUNCIA", documentos: AUTORIZACION_DENUNCIA_DOCUMENTOS },
};

export const consentChecked = (aceptado: boolean, from: string = FROM): QueryResultEvent => ({
  channel: "whatsapp",
  from,
  type: InternalEventType.QUERY_RESULT,
  queryKind: QueryKind.CONSULTAR_ACEPTACION_TERMINOS,
  result: { resultado: aceptado ? AceptacionTerminosLookup.FOUND : AceptacionTerminosLookup.NOT_FOUND },
});

export const consentRegistered = (from: string = FROM): QueryResultEvent => ({
  channel: "whatsapp",
  from,
  type: InternalEventType.QUERY_RESULT,
  queryKind: QueryKind.REGISTRAR_ACEPTACION_TERMINOS,
  result: { resultado: AceptacionTerminosStatus.SAVED },
});

export function answerConsent(
  begun: HandlerResult,
  { aceptado = true, from = FROM }: { aceptado?: boolean; from?: string } = {},
): HandlerResult {
  if (begun.session.state !== SessionState.INCIDENCIA_CONSENT_CHECK_PENDING) return begun;
  const checked = handle(begun.session, consentChecked(aceptado, from));
  if (aceptado) return checked;
  const tapped = handle(checked.session, {
    channel: "whatsapp",
    from,
    type: InboundEventType.BUTTON,
    listId: IncidenciaButtonId.CONSENT_SI,
  });
  return handle(tapped.session, consentRegistered(from));
}
