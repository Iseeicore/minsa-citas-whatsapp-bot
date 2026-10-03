import { sendButtons } from "@/lib/fsm/core/handlers-shared";
import { ReauthButtonId } from "@/lib/enums/reauth-button-id";
import { SessionState } from "@/lib/enums/session-state";

export const REAUTH_STATE = SessionState.CITA_AWAITING_REAUTH;
export const REAUTH_YES_ID = ReauthButtonId.YES;
export const REAUTH_NO_ID = ReauthButtonId.NO;

const REAUTH_PROMPT_TEXT =
  "⏳ Tu sesión ha expirado por inactividad. Por tu seguridad, necesitamos confirmar nuevamente tu identidad para continuar con tu cita. ¿Deseas solicitar un nuevo código de verificación?\n\n[1] Sí, enviar código\n[2] Cancelar";

export const reauthPrompt = () =>
  sendButtons(REAUTH_PROMPT_TEXT, [
    { id: REAUTH_YES_ID, title: "Sí, enviar código" },
    { id: REAUTH_NO_ID, title: "Cancelar" },
  ]);
