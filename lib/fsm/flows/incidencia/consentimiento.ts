import { enterDescripcion } from "@/lib/fsm/flows/incidencia/borrador";
import { readConfirmation } from "@/lib/fsm/flows/incidencia/confirmation";
import { buildResult, cloneSession, query, sendButtons, sendText, withRejectionNotice } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { Confirmation } from "@/lib/enums/confirmation";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";
import { AVISO_PRIVACIDAD_TEXT, CONSENT_QUESTION_TEXT, CONSENT_BUTTONS, NO_AUTORIZO_TEXT } from "@/lib/constants/textos/incidencia";

export function askConsentimiento(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_CONSENT_CHECK_PENDING;
  return buildResult(next, [query(QueryKind.VERIFICAR_CONSENTIMIENTO, {})]);
}

function consentimientoPrompt() {
  return [sendText(AVISO_PRIVACIDAD_TEXT), sendButtons(CONSENT_QUESTION_TEXT, CONSENT_BUTTONS)];
}

export function handleConsentCheckPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { aceptado?: boolean };
  const next = cloneSession(session);

  if (result.aceptado === true) return enterDescripcion(next);

  next.state = SessionState.INCIDENCIA_CONSENT_CHOICE;
  return buildResult(next, consentimientoPrompt());
}

export function resendConsentimiento(session: Session): HandlerResult {
  return buildResult(cloneSession(session), consentimientoPrompt());
}

export function handleConsentimiento(session: Session, event: InboundEvent): HandlerResult {
  const answer = readConfirmation(event, IncidenciaButtonId.CONSENT_SI, IncidenciaButtonId.CONSENT_NO);

  if (answer === Confirmation.YES) {
    const next = cloneSession(session);
    next.state = SessionState.INCIDENCIA_CONSENT_REGISTER_PENDING;
    return buildResult(next, [query(QueryKind.REGISTRAR_CONSENTIMIENTO, {})]);
  }

  if (answer === Confirmation.NO) {
    return buildResult({ state: SessionState.INCIDENCIA_CANCELLED, slots: {}, counters: {} }, [sendText(NO_AUTORIZO_TEXT)]);
  }

  return withRejectionNotice(buildResult(session, [sendButtons(CONSENT_QUESTION_TEXT, CONSENT_BUTTONS)]));
}

export function handleConsentRegisterPending(session: Session): HandlerResult {
  return enterDescripcion(cloneSession(session));
}
