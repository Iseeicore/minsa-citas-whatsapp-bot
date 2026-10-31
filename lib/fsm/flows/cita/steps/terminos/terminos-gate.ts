import { isTerminosEnabled } from "@/lib/config/features";
import { buildResult, cloneSession } from "@/lib/fsm/core/handlers-shared";
import { askCuentaMinsa } from "@/lib/fsm/flows/cita/steps/cuenta-minsa/cuenta-minsa";
import type { HandlerResult, SendConsentEffect, Session } from "@/lib/fsm/core/types";
import {
  TERMINOS_ACCEPT_LABEL,
  TERMINOS_BUTTONS,
  TERMINOS_CHECKBOX_LABEL,
  TERMINOS_CONTENIDO,
  TERMINOS_PROMPT_TEXT,
  TERMINOS_REOPEN_LABEL,
  TERMINOS_TITULO_TEXT,
  terminosWhatsappBodyText,
} from "@/lib/constants/textos/terminos";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { TerminosResume } from "@/lib/enums/terminos-resume";

export function buildTerminosEffect(): SendConsentEffect {
  return {
    kind: SendType.CONSENT,
    title: TERMINOS_TITULO_TEXT,
    text: TERMINOS_PROMPT_TEXT,
    content: TERMINOS_CONTENIDO,
    buttons: TERMINOS_BUTTONS,
    acceptLabel: TERMINOS_ACCEPT_LABEL,
    checkboxLabel: TERMINOS_CHECKBOX_LABEL,
    reopenLabel: TERMINOS_REOPEN_LABEL,
    whatsappText: terminosWhatsappBodyText(TERMINOS_PROMPT_TEXT),
    withTerminosLink: true,
  };
}

export function isTerminosRequired(session: Session): boolean {
  return isTerminosEnabled() && session.slots[SlotKey.TERMINOS_ACEPTADOS] !== true;
}

export function askTerminos(session: Session, resume: TerminosResume): HandlerResult {
  const next = cloneSession(session);
  next.slots[SlotKey.TERMINOS_RESUME] = resume;
  next.state = SessionState.CITA_AWAITING_TERMINOS;
  return buildResult(next, [buildTerminosEffect()]);
}

export function reshowTerminos(session: Session): HandlerResult {
  return buildResult(session, [buildTerminosEffect()]);
}

export function startCitaIdentity(session: Session, intro: string): HandlerResult {
  if (!isTerminosRequired(session)) return askCuentaMinsa(session, intro);
  return askTerminos({ ...session, slots: { ...session.slots, [SlotKey.TERMINOS_INTRO_TEXT]: intro } }, TerminosResume.ASK_DOCUMENTO);
}
