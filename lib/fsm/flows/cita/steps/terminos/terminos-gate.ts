import { isTerminosEnabled } from "@/lib/config/features";
import { findTerminosUrl } from "@/lib/config/terminos";
import { buildResult, cloneSession, query, sendText } from "@/lib/fsm/core/handlers-shared";
import { channelOf } from "@/lib/fsm/core/channel";
import { askCuentaMinsa } from "@/lib/fsm/flows/cita/steps/cuenta-minsa/cuenta-minsa";
import type { HandlerResult, SendConsentEffect, Session } from "@/lib/fsm/core/types";
import {
  DOCUMENTOS_TITULO_TEXT,
  TERMINOS_ACCEPT_LABEL,
  TERMINOS_BUTTONS,
  TERMINOS_CHECKS,
  TERMINOS_PROMPT_TEXT,
  TERMINOS_REOPEN_LABEL,
  terminosWhatsappAvisoText,
  terminosWhatsappBodyText,
} from "@/lib/constants/textos/terminos";
import { ASK_DOCUMENTO_TEXT, WHATSAPP_ASK_DOCUMENTO_TEXT } from "@/lib/constants/textos/identidad";
import { SessionChannel } from "@/lib/enums/session-channel";
import { DOCUMENTOS_CITA, DOCUMENTOS_SECCIONES } from "@/lib/constants/documentos-aceptacion";
import { FlujoAceptacion } from "@/lib/enums/consentimiento/flujo-aceptacion";
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
    content: DOCUMENTOS_SECCIONES.flatMap((seccion) => seccion.apartados),
    buttons: TERMINOS_BUTTONS,
    acceptLabel: TERMINOS_ACCEPT_LABEL,
    checks: TERMINOS_CHECKS,
    reopenLabel: TERMINOS_REOPEN_LABEL,
    whatsappText: terminosWhatsappBodyText(TERMINOS_PROMPT_TEXT),
    withTerminosLink: true,
  };
}

export function isTerminosRequired(session: Session): boolean {
  return isTerminosEnabled() && session.channel !== SessionChannel.WHATSAPP && session.slots[SlotKey.TERMINOS_ACEPTADOS] !== true;
}

function askWhatsappDocumento(session: Session, intro = WHATSAPP_ASK_DOCUMENTO_TEXT): HandlerResult {
  const url = isTerminosEnabled() ? findTerminosUrl() : undefined;
  const text = url ? terminosWhatsappAvisoText(url, intro) : intro;
  return buildResult({ ...session, state: SessionState.CITA_AWAITING_DNI }, [sendText(text)]);
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

export function startCitaIdentity(session: Session, intro?: string): HandlerResult {
  if (channelOf(session) === SessionChannel.WHATSAPP) return askWhatsappDocumento(session, intro);
  const webIntro = intro ?? ASK_DOCUMENTO_TEXT;
  if (!isTerminosRequired(session)) return askCuentaMinsa(session, webIntro);
  return askTerminos({ ...session, slots: { ...session.slots, [SlotKey.TERMINOS_INTRO_TEXT]: webIntro } }, TerminosResume.ASK_DOCUMENTO);
}
