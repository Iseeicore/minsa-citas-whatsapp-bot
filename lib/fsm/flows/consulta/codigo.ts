import { buildResult, cloneSession, sendButtons, sendText, withRejectionNotice } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { closeExhausted } from "@/lib/fsm/flows/consulta/cierre";
import { askEstablecimiento } from "@/lib/fsm/flows/consulta/establecimiento";
import { readConfirmation } from "@/lib/fsm/flows/incidencia/confirmation";
import { extractCodigoIncidencia, isCodigoAnonimo } from "@/lib/fsm/parsing/text/codigo-incidencia";
import {
  ASK_TIPO_TEXT,
  CODIGO_EJEMPLO_ANONIMA,
  CODIGO_EJEMPLO_CON_DNI,
  CODIGO_NO_RECONOCIDO_TEXT,
  CONSULTA_TIPO_BUTTONS,
  SERIE_ANONIMA_TEXT,
  SERIE_CON_DNI_TEXT,
  askCodigoText,
  invalidCodigoText,
  otraSerieText,
} from "@/lib/constants/textos/consulta";
import { MAX_INTENTOS_CODIGO } from "@/lib/constants/limits/consulta";
import { Confirmation } from "@/lib/enums/confirmation";
import { ConsultaTipoButtonId } from "@/lib/enums/consulta-tipo-button-id";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

function toEjemplo(anonima: boolean | undefined): string {
  return anonima ? CODIGO_EJEMPLO_ANONIMA : CODIGO_EJEMPLO_CON_DNI;
}

function toSerie(anonima: boolean): string {
  return anonima ? SERIE_ANONIMA_TEXT : SERIE_CON_DNI_TEXT;
}

function retryCodigo(session: Session): HandlerResult {
  const next = cloneSession(session);
  const attempts = (next.counters[CounterKey.CONSULTA_INTENTOS_CODIGO] ?? 0) + 1;
  next.counters[CounterKey.CONSULTA_INTENTOS_CODIGO] = attempts;
  if (attempts >= MAX_INTENTOS_CODIGO) return closeExhausted(next, CODIGO_NO_RECONOCIDO_TEXT);
  return buildResult(next, [sendText(invalidCodigoText(toEjemplo(next.slots[SlotKey.CONSULTA_ANONIMA])))]);
}

export function askTipo(next: Session): HandlerResult {
  next.state = SessionState.CONSULTA_AWAITING_TIPO;
  return buildResult(next, [sendButtons(ASK_TIPO_TEXT, CONSULTA_TIPO_BUTTONS)]);
}

export function acceptCodigo(next: Session, codigo: string): HandlerResult {
  next.slots[SlotKey.CONSULTA_CODIGO] = codigo;
  next.slots[SlotKey.CONSULTA_ANONIMA] = isCodigoAnonimo(codigo);
  return askEstablecimiento(next);
}

export function handleAwaitingTipo(session: Session, event: InboundEvent): HandlerResult {
  const codigo = event.text ? extractCodigoIncidencia(event.text) : undefined;
  if (codigo) return acceptCodigo(cloneSession(session), codigo);

  const answer = readConfirmation(event, ConsultaTipoButtonId.ANONIMA, ConsultaTipoButtonId.CON_DNI);
  if (!answer) return withRejectionNotice(buildResult(session, [sendButtons(ASK_TIPO_TEXT, CONSULTA_TIPO_BUTTONS)]));

  const next = cloneSession(session);
  const anonima = answer === Confirmation.YES;
  next.slots[SlotKey.CONSULTA_ANONIMA] = anonima;
  next.state = SessionState.CONSULTA_AWAITING_CODIGO;
  return buildResult(next, [sendText(askCodigoText(toEjemplo(anonima)))]);
}

export function handleAwaitingCodigo(session: Session, event: InboundEvent): HandlerResult {
  const anonima = session.slots[SlotKey.CONSULTA_ANONIMA];
  const codigo = event.text ? extractCodigoIncidencia(event.text) : undefined;
  if (!codigo) return event.text ? retryCodigo(session) : buildResult(session, [sendText(askCodigoText(toEjemplo(anonima)))]);

  const delCodigo = isCodigoAnonimo(codigo);
  if (anonima !== undefined && delCodigo !== anonima) {
    return buildResult(session, [sendText(otraSerieText(toSerie(delCodigo), toEjemplo(anonima)))]);
  }
  return acceptCodigo(cloneSession(session), codigo);
}
