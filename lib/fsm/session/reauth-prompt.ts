import { sendButtons } from "@/lib/fsm/core/handlers-shared";

export const REAUTH_STATE = "cita_awaiting_reauth";
export const REAUTH_YES_ID = "cita_reauth_si";
export const REAUTH_NO_ID = "cita_reauth_no";

const REAUTH_PROMPT_TEXT =
  "⏳ Tu sesión ha expirado por inactividad. Por tu seguridad, necesitamos confirmar nuevamente tu identidad para continuar con tu cita. ¿Deseas solicitar un nuevo código de verificación?\n\n[1] Sí, enviar código\n[2] Cancelar";

export const reauthPrompt = () =>
  sendButtons(REAUTH_PROMPT_TEXT, [
    { id: REAUTH_YES_ID, title: "Sí, enviar código" },
    { id: REAUTH_NO_ID, title: "Cancelar" },
  ]);
