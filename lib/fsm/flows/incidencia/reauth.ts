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

const REAUTH_PROMPT_TEXT = "⏳ Tu incidencia quedó inactiva por un tiempo. ¿Deseas continuar donde la dejaste?\n\n[1] Sí, continuar\n[2] Cancelar";

const REAUTH_BUTTONS = [
  { id: IncidenciaButtonId.REAUTH_SI, title: "Sí, continuar" },
  { id: IncidenciaButtonId.REAUTH_NO, title: "Cancelar" },
];

const REAUTH_CANCELLED_TEXT =
  "Entendido, no se registró ninguna incidencia. Cuando quieras registrar una, escríbenos nuevamente. ¡Que tengas un buen día! 👋";

function reauthPrompt() {
  return sendButtons(REAUTH_PROMPT_TEXT, REAUTH_BUTTONS);
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
  next.state = (typeof resumeState === "string" ? resumeState : SessionState.INCIDENCIA_AWAITING_UBICACION) as Session["state"];

  switch (next.state) {
    case SessionState.INCIDENCIA_CONFIRM_UBICACION:
      return resendConfirmUbicacion(next);
    case SessionState.INCIDENCIA_CONFIRM_OMITIR:
      return offerOmitir(next, "");
    case SessionState.INCIDENCIA_IDENTITY_CHOICE:
      return askIdentityChoice(next);
    case SessionState.INCIDENCIA_AWAITING_DNI:
      return buildResult(next, [sendText("Ingresa tu número de documento.")]);
    case SessionState.INCIDENCIA_AWAITING_NOMBRE_LIBRE:
      return buildResult(next, [sendText("Por favor, ingresa tu nombre.")]);
    case SessionState.INCIDENCIA_CONSENT_CHOICE:
      return resendConsentimiento(next);
    case SessionState.INCIDENCIA_CONFIRM_BORRADOR:
    case SessionState.INCIDENCIA_AWAITING_DESCRIPCION:
      return enterDescripcion(next);
    case SessionState.INCIDENCIA_AWAITING_BORRADOR_EXTRA:
      return buildResult(next, [sendText("Escribe lo que quieras agregar.")]);
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

  if (answer === Confirmation.YES) return withLeadingText(resumeIncidencia(session), "¡Listo! Continuemos donde quedaste.");

  if (answer === Confirmation.NO) {
    return buildResult({ state: SessionState.INCIDENCIA_CANCELLED, slots: {}, counters: {} }, [sendText(REAUTH_CANCELLED_TEXT)]);
  }

  return withRejectionNotice(buildResult(session, [reauthPrompt()]));
}
