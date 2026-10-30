import { CONSENT_ACCEPTED_PHRASE, CONSENT_DECLINED_PHRASE } from "@/lib/constants/regex/incidencia";
import { WORD_SEPARATORS } from "@/lib/constants/regex/text";
import { stripAccents } from "@/lib/utils/text-values";
import { readConfirmation } from "@/lib/fsm/flows/incidencia/confirmation";
import { readInicio, writeInicio } from "@/lib/fsm/flows/incidencia/inicio";
import { startUbicacion } from "@/lib/fsm/flows/incidencia/ubicacion";
import { buildResult, cloneSession, query, sendButtons, sendText, withRejectionNotice } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendConsentEffect, Session } from "@/lib/fsm/core/types";
import { Confirmation } from "@/lib/enums/confirmation";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { QueryKind } from "@/lib/enums/query-kind";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";
import {
  AVISO_PRIVACIDAD_TEXT,
  CONSENT_ACCEPT_LABEL,
  CONSENT_BUTTONS,
  CONSENT_QUESTION_TEXT,
  CONSENT_REOPEN_LABEL,
  CONSENT_TITULO_TEXT,
  NO_AUTORIZO_TEXT,
  consentimientoBubbleText,
  consentimientoWhatsappText,
} from "@/lib/constants/textos/incidencia";

export function buildConsentimientoEffect(lead: string): SendConsentEffect {
  return {
    kind: SendType.CONSENT,
    title: CONSENT_TITULO_TEXT,
    text: consentimientoBubbleText(lead),
    content: AVISO_PRIVACIDAD_TEXT,
    buttons: CONSENT_BUTTONS,
    acceptLabel: CONSENT_ACCEPT_LABEL,
    reopenLabel: CONSENT_REOPEN_LABEL,
    whatsappText: consentimientoWhatsappText(lead),
  };
}

export function handleConsentCheckPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { aceptado?: boolean };
  const next = cloneSession(session);

  if (result.aceptado === true) return startUbicacion(next);

  const { lead, ...resto } = readInicio(next.slots);
  writeInicio(next.slots, resto);
  next.state = SessionState.INCIDENCIA_CONSENT_CHOICE;
  return buildResult(next, [buildConsentimientoEffect(lead ?? "")]);
}

export function resendConsentimiento(session: Session): HandlerResult {
  return buildResult(cloneSession(session), [buildConsentimientoEffect("")]);
}

function readConsent(event: InboundEvent): Confirmation | undefined {
  const phrase = stripAccents((event.text ?? "").toLowerCase())
    .replace(WORD_SEPARATORS, " ")
    .trim();
  if (CONSENT_ACCEPTED_PHRASE.test(phrase)) return Confirmation.YES;
  if (CONSENT_DECLINED_PHRASE.test(phrase)) return Confirmation.NO;
  return readConfirmation(event, IncidenciaButtonId.CONSENT_SI, IncidenciaButtonId.CONSENT_NO);
}

export function handleConsentimiento(session: Session, event: InboundEvent): HandlerResult {
  const answer = readConsent(event);

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
  return startUbicacion(cloneSession(session));
}
