import { enterDescripcion } from "@/lib/fsm/flows/incidencia/borrador";
import { readConfirmation } from "@/lib/fsm/flows/incidencia/confirmation";
import { resendConsentimiento } from "@/lib/fsm/flows/incidencia/consentimiento";
import { askConfirmRegistro, askFoto } from "@/lib/fsm/flows/incidencia/pasos-comunes";
import { askIdentityChoice, askUbicacionAgain, offerOmitir, resendConfirmUbicacion } from "@/lib/fsm/flows/incidencia/ubicacion";
import { buildResult, cloneSession, sendButtons, sendText, withLeadingText, withRejectionNotice } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { Confirmation } from "@/lib/enums/confirmation";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { ASK_DOCUMENTO_TEXT } from "@/lib/constants/textos/identidad";
import {
  ASK_BORRADOR_EXTRA_TEXT,
  INCIDENCIA_REAUTH_PROMPT_TEXT,
  INCIDENCIA_REAUTH_BUTTONS,
  INCIDENCIA_RETOMADA_TEXT,
  INCIDENCIA_CANCELADA_TEXT,
} from "@/lib/constants/textos/incidencia";
import { stringOr } from "@/lib/utils/text-values";

function reauthPrompt() {
  return sendButtons(INCIDENCIA_REAUTH_PROMPT_TEXT, INCIDENCIA_REAUTH_BUTTONS);
}

export function beginIncidenciaReauth(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.slots[SlotKey.INCIDENCIA_RESUME_STATE] = session.state;
  next.state = SessionState.INCIDENCIA_AWAITING_REAUTH;
  return buildResult(next, [reauthPrompt()]);
}

function resumeIncidencia(session: Session): HandlerResult {
  const resumeState = session.slots[SlotKey.INCIDENCIA_RESUME_STATE];
  const next = cloneSession(session);
  delete next.slots[SlotKey.INCIDENCIA_RESUME_STATE];
  next.state = stringOr(resumeState, SessionState.INCIDENCIA_AWAITING_UBICACION) as Session["state"];

  switch (next.state) {
    case SessionState.INCIDENCIA_CONFIRM_UBICACION:
      return resendConfirmUbicacion(next);
    case SessionState.INCIDENCIA_CONFIRM_OMITIR:
      return offerOmitir(next, "");
    case SessionState.INCIDENCIA_IDENTITY_CHOICE:
      return askIdentityChoice(next);
    case SessionState.INCIDENCIA_AWAITING_DNI:
      return buildResult(next, [sendText(ASK_DOCUMENTO_TEXT)]);
    case SessionState.INCIDENCIA_CONSENT_CHOICE:
      return resendConsentimiento(next);
    case SessionState.INCIDENCIA_CONFIRM_BORRADOR:
    case SessionState.INCIDENCIA_AWAITING_DESCRIPCION:
      return enterDescripcion(next);
    case SessionState.INCIDENCIA_AWAITING_BORRADOR_EXTRA:
      return buildResult(next, [sendText(ASK_BORRADOR_EXTRA_TEXT)]);
    case SessionState.INCIDENCIA_AWAITING_FOTO:
      return buildResult(next, [askFoto()]);
    case SessionState.INCIDENCIA_CONFIRM_REGISTRO:
      return askConfirmRegistro(next);
    case SessionState.INCIDENCIA_AWAITING_UBICACION:
    default:
      return askUbicacionAgain(next);
  }
}

export function handleAwaitingIncidenciaReauth(session: Session, event: InboundEvent): HandlerResult {
  const answer = readConfirmation(event, IncidenciaButtonId.REAUTH_SI, IncidenciaButtonId.REAUTH_NO);

  if (answer === Confirmation.YES) return withLeadingText(resumeIncidencia(session), INCIDENCIA_RETOMADA_TEXT);

  if (answer === Confirmation.NO) {
    return buildResult({ state: SessionState.INCIDENCIA_CANCELLED, slots: {}, counters: {} }, [sendText(INCIDENCIA_CANCELADA_TEXT)]);
  }

  return withRejectionNotice(buildResult(session, [reauthPrompt()]));
}
