import { enterDescripcion } from "@/lib/fsm/flows/incidencia/borrador";
import { readConfirmation, withRejectionNotice } from "@/lib/fsm/flows/incidencia/confirmation";
import { buildResult, cloneSession, query, sendButtons, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { Confirmation } from "@/lib/enums/confirmation";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";

const CONSENT_SI = IncidenciaButtonId.CONSENT_SI;
const CONSENT_NO = IncidenciaButtonId.CONSENT_NO;

export const CONSENT_BUTTONS = [
  { id: CONSENT_SI, title: "Autorizo y deseo continuar" },
  { id: CONSENT_NO, title: "No autorizo" },
];

export const AVISO_PRIVACIDAD_TEXT =
  "Antes de continuar, necesitamos tu autorización para tratar la información que envíes por este canal. El texto, las imágenes y los datos personales que proporciones podrán ser revisados por el personal autorizado del establecimiento o del MINSA, únicamente para evaluar, derivar, investigar y dar seguimiento a tu incidencia.";

export const NO_AUTORIZO_TEXT =
  "Entendido. No se registrará tu incidencia por este canal. Cuando quieras registrar una, escríbenos nuevamente. ¡Que tengas un buen día! 👋";

/**
 * Entrada común antes del relato: si ese wa_id ya autorizó el tratamiento de datos alguna vez, no se le vuelve a preguntar.
 * Reemplaza la llamada directa a `enterDescripcion` una vez resuelta la identidad (con nombre, anónimo, o con/sin RENIEC).
 */
export function askConsentimiento(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_CONSENT_CHECK_PENDING;
  return buildResult(next, [query(QueryKind.VERIFICAR_CONSENTIMIENTO, {})]);
}

export function handleConsentCheckPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { aceptado?: boolean };
  const next = cloneSession(session);

  if (result.aceptado === true) return enterDescripcion(next);

  next.state = SessionState.INCIDENCIA_CONSENT_CHOICE;
  return buildResult(next, [sendText(AVISO_PRIVACIDAD_TEXT), sendButtons("¿Autorizas el tratamiento de tus datos?", CONSENT_BUTTONS)]);
}

export function handleConsentimiento(session: Session, event: InboundEvent): HandlerResult {
  const answer = readConfirmation(event, CONSENT_SI, CONSENT_NO);

  if (answer === Confirmation.YES) {
    const next = cloneSession(session);
    next.state = SessionState.INCIDENCIA_CONSENT_REGISTER_PENDING;
    return buildResult(next, [query(QueryKind.REGISTRAR_CONSENTIMIENTO, {})]);
  }

  if (answer === Confirmation.NO) {
    return buildResult({ state: SessionState.INCIDENCIA_CANCELLED, slots: {}, counters: {} }, [sendText(NO_AUTORIZO_TEXT)]);
  }

  return withRejectionNotice(buildResult(session, [sendButtons("¿Autorizas el tratamiento de tus datos?", CONSENT_BUTTONS)]));
}

export function handleConsentRegisterPending(session: Session): HandlerResult {
  return enterDescripcion(cloneSession(session));
}
