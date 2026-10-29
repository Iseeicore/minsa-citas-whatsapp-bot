import { isTerminosEnabled } from "@/lib/config/features";
import { buildResult, cloneSession, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, SendTerminosEffect, Session } from "@/lib/fsm/core/types";
import { TERMINOS_BUTTONS, TERMINOS_CONTENIDO, TERMINOS_PROMPT_TEXT, TERMINOS_TITULO_TEXT } from "@/lib/constants/textos/terminos";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { TerminosResume } from "@/lib/enums/terminos-resume";

export function buildTerminosEffect(): SendTerminosEffect {
  return {
    kind: SendType.TERMINOS,
    title: TERMINOS_TITULO_TEXT,
    text: TERMINOS_PROMPT_TEXT,
    content: TERMINOS_CONTENIDO,
    buttons: TERMINOS_BUTTONS,
  };
}

export function needsTerminos(session: Session): boolean {
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

export function askCitaDocumento(session: Session, intro: string): HandlerResult {
  return buildResult({ ...session, state: SessionState.CITA_AWAITING_DNI }, [sendText(intro)]);
}

export function startCitaIdentity(session: Session, intro: string): HandlerResult {
  if (!needsTerminos(session)) return askCitaDocumento(session, intro);
  return askTerminos({ ...session, slots: { ...session.slots, [SlotKey.TERMINOS_INTRO_TEXT]: intro } }, TerminosResume.ASK_DOCUMENTO);
}
