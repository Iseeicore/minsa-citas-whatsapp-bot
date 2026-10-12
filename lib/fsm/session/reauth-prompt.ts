import { sendButtons } from "@/lib/fsm/core/handlers-shared";
import { CITA_REAUTH_PROMPT_TEXT, CITA_REAUTH_BUTTONS } from "@/lib/constants/textos/cita-identidad";

export const reauthPrompt = () =>
  sendButtons(CITA_REAUTH_PROMPT_TEXT, CITA_REAUTH_BUTTONS);
