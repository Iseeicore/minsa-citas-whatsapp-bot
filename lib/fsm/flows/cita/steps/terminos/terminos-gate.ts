import { isTerminosEnabled } from "@/lib/config/features";
import { buildResult, cloneSession, query } from "@/lib/fsm/core/handlers-shared";
import { askCuentaMinsa } from "@/lib/fsm/flows/cita/steps/cuenta-minsa/cuenta-minsa";
import type { HandlerResult, SendConsentEffect, Session } from "@/lib/fsm/core/types";
import {
  DOCUMENTOS_TITULO_TEXT,
  TERMINOS_ACCEPT_LABEL,
  TERMINOS_BUTTONS,
  TERMINOS_CHECKS,
  TERMINOS_PROMPT_TEXT,
  TERMINOS_REOPEN_LABEL,
  terminosWhatsappBodyText,
} from "@/lib/constants/textos/terminos";
import { DOCUMENTOS_CITA, DOCUMENTOS_SECCIONES } from "@/lib/constants/documentos-aceptacion";
import { documentSectionsText } from "@/lib/utils/document-sections-text";
import { FlujoAceptacion } from "@/lib/enums/flujo-aceptacion";
import { QueryKind } from "@/lib/enums/query-kind";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { TerminosResume } from "@/lib/enums/terminos-resume";

export function buildTerminosEffect(): SendConsentEffect {
  return {
    kind: SendType.CONSENT,
    title: DOCUMENTOS_TITULO_TEXT,
    text: TERMINOS_PROMPT_TEXT,
    content: documentSectionsText(DOCUMENTOS_SECCIONES),
    buttons: TERMINOS_BUTTONS,
    acceptLabel: TERMINOS_ACCEPT_LABEL,
    checks: TERMINOS_CHECKS,
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
  next.state = SessionState.CITA_TERMINOS_LOOKUP_PENDING;
  return buildResult(next, [query(QueryKind.CONSULTAR_ACEPTACION_TERMINOS, { flujo: FlujoAceptacion.CITA, documentos: DOCUMENTOS_CITA })]);
}

export function showTerminos(session: Session): HandlerResult {
  const next = cloneSession(session);
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
