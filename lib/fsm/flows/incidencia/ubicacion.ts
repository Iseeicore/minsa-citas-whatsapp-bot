import type { BuscarEstablecimientoResult } from "@/lib/establecimientos/buscar";
import { decidirCandidatos, type Establecimiento } from "@/lib/establecimientos/decidir";
import { readConfirmation } from "@/lib/fsm/flows/incidencia/confirmation";
import {
  buildResult,
  cloneSession,
  omitSlot,
  query,
  sendButtons,
  sendText,
  withLeadingText,
  withRejectionNotice,
  readTrimmedText,
} from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { parseCodigoSuelto, type InicioIncidencia } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { quiereOmitirUbicacion } from "@/lib/fsm/parsing/text/omitir-ubicacion";
import { looksLikeNoise } from "@/lib/security/text-noise";
import { Confirmation } from "@/lib/enums/confirmation";
import { CounterKey } from "@/lib/enums/counter-key";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import {
  ASK_UBICACION_TEXT,
  ASK_OTRA_UBICACION_TEXT,
  CODIGO_NO_ENCONTRADO_TEXT,
  UBICACION_ILEGIBLE_TEXT,
  UBICACION_RECHAZADA_TEXT,
  UBICACION_BUTTONS,
  OMITIR_BUTTONS,
  INCIDENCIA_LEAD_IN_TEXT,
  UBICACION_NO_UBICADA_TEXT,
  UBICACION_NO_DISPONIBLE_TEXT,
  UBICACION_VARIOS_TEXT,
  UBICACION_NO_ENCONTRADA_TEXT,
  UBICACION_CONFIRM_RETRY_TEXT,
  OMITIR_QUESTION_TEXT,
  OMITIR_ACEPTADO_TEXT,
  ubicacionDistritoLineText,
  confirmUbicacionText,
  ubicacionAceptadaText,
  OMITIR_RETRY_TEXT,
  IDENTITY_QUESTION_TEXT,
  INCIDENCIA_IDENTIDAD_BUTTONS,
  UNREADABLE_TEXT_RETRY,
} from "@/lib/constants/textos/incidencia";
import { AVISO_EMERGENCIA_TEXT } from "@/lib/constants/textos/fuera-de-alcance";
import { EstablecimientoSearchStatus } from "@/lib/enums/establecimiento-search-status";
import { EstablecimientoSearchBy } from "@/lib/enums/establecimiento-search-by";
import { EstablecimientoDecision } from "@/lib/enums/establecimiento-decision";
import { IncidenciaOrigen } from "@/lib/enums/incidencia-origen";
import { isString } from "@/lib/utils/type-guards";
import { parseJsonOr } from "@/lib/utils/safe-json";
import { MAX_INTENTOS_UBICACION } from "@/lib/constants/limits/incidencia";

type Propuesto = { id: number; areaId: number; codigoRenipress: string; nombre: string; distrito: string | null };

const toPropuesto = (establecimiento: Establecimiento): Propuesto => ({
  id: establecimiento.id,
  areaId: establecimiento.areaId,
  codigoRenipress: establecimiento.codigoRenipress,
  nombre: establecimiento.nombre,
  distrito: establecimiento.distrito,
});

function readPropuesto(session: Session): Propuesto | undefined {
  const raw = session.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_PROPUESTO];
  if (!isString(raw)) return undefined;
  return parseJsonOr(raw, undefined) as Propuesto | undefined;
}

function leadIn(lead: string): string {
  return [lead, INCIDENCIA_LEAD_IN_TEXT].filter(Boolean).join(" ");
}

function searching(next: Session, payload: { codigo?: string; nombre?: string }): HandlerResult {
  next.state = SessionState.INCIDENCIA_UBICACION_PENDING;
  return buildResult(next, [query(QueryKind.BUSCAR_ESTABLECIMIENTO, payload)]);
}

export function beginIncidencia(slots: Session["slots"], lead: string, inicio: InicioIncidencia | null = null): HandlerResult {
  const next: Session = { state: SessionState.INCIDENCIA_AWAITING_UBICACION, slots: { ...slots }, counters: {} };
  next.slots[SlotKey.INCIDENCIA_ORIGEN] = inicio?.origen ?? IncidenciaOrigen.MENU;
  if (inicio?.resto) next.slots[SlotKey.INCIDENCIA_BORRADOR] = inicio.resto;

  if (inicio?.codigoRenipress) {
    if (inicio.nombre) next.slots[SlotKey.INCIDENCIA_UBICACION_TEXTO] = inicio.nombre;
    return withLeadingText(searching(next, { codigo: inicio.codigoRenipress }), AVISO_EMERGENCIA_TEXT);
  }
  if (inicio?.nombre) return withLeadingText(searching(next, { nombre: inicio.nombre }), AVISO_EMERGENCIA_TEXT);
  return withLeadingText(buildResult(next, [sendText(`${leadIn(lead)} ${ASK_UBICACION_TEXT}`)]), AVISO_EMERGENCIA_TEXT);
}

export function handleAwaitingUbicacion(session: Session, event: InboundEvent): HandlerResult {
  const text = readTrimmedText(event);
  if (!text) return buildResult(session, [sendText(ASK_OTRA_UBICACION_TEXT)]);
  if (quiereOmitirUbicacion(text)) return offerOmitir(cloneSession(session), "");

  const codigo = parseCodigoSuelto(text);
  if (!codigo && looksLikeNoise(text)) return buildResult(session, [sendText(UNREADABLE_TEXT_RETRY)]);
  return searching(cloneSession(session), codigo ? { codigo } : { nombre: text });
}

function failedAttempt(next: Session, message: string): HandlerResult {
  const attempts = (next.counters[CounterKey.INCIDENCIA_UBICACION_INTENTOS] ?? 0) + 1;
  next.counters[CounterKey.INCIDENCIA_UBICACION_INTENTOS] = attempts;
  if (attempts >= MAX_INTENTOS_UBICACION) return offerOmitir(next, UBICACION_NO_UBICADA_TEXT);
  next.state = SessionState.INCIDENCIA_AWAITING_UBICACION;
  return buildResult(next, [sendText(message)]);
}

function confirmUbicacion(next: Session, establecimiento: Establecimiento): HandlerResult {
  next.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_PROPUESTO] = JSON.stringify(toPropuesto(establecimiento));
  next.state = SessionState.INCIDENCIA_CONFIRM_UBICACION;
  const distrito = establecimiento.distrito ? ubicacionDistritoLineText(establecimiento.distrito) : "";
  return buildResult(next, [
    sendButtons(confirmUbicacionText(establecimiento.nombre, establecimiento.codigoRenipress, distrito), UBICACION_BUTTONS),
  ]);
}

export function handleUbicacionPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as BuscarEstablecimientoResult;
  const next = cloneSession(session);
  const fromTexto = next.slots[SlotKey.INCIDENCIA_ORIGEN] === IncidenciaOrigen.TEXTO;
  next.slots[SlotKey.INCIDENCIA_ORIGEN] = IncidenciaOrigen.MENU;

  if (result.status === EstablecimientoSearchStatus.UNAVAILABLE) {
    return offerOmitir(next, UBICACION_NO_DISPONIBLE_TEXT);
  }

  if (result.by === EstablecimientoSearchBy.CODIGO) {
    if (result.status === EstablecimientoSearchStatus.FOUND) return confirmUbicacion(next, result.establecimiento);
    const nombre = next.slots[SlotKey.INCIDENCIA_UBICACION_TEXTO];
    if (nombre) {
      next.slots = omitSlot(next.slots, SlotKey.INCIDENCIA_UBICACION_TEXTO);
      return searching(next, { nombre });
    }
    return failedAttempt(next, CODIGO_NO_ENCONTRADO_TEXT);
  }

  if (result.by !== EstablecimientoSearchBy.NOMBRE || result.status !== EstablecimientoSearchStatus.OK)
    return failedAttempt(next, UBICACION_ILEGIBLE_TEXT);

  const decision = decidirCandidatos(result.candidatos);
  if (fromTexto && decision.kind !== EstablecimientoDecision.NINGUNO) next.slots = omitSlot(next.slots, SlotKey.INCIDENCIA_BORRADOR);

  switch (decision.kind) {
    case EstablecimientoDecision.UNO:
      return confirmUbicacion(next, decision.establecimiento);
    case EstablecimientoDecision.VARIOS:
      return failedAttempt(next, UBICACION_VARIOS_TEXT);
    default:
      return failedAttempt(next, UBICACION_NO_ENCONTRADA_TEXT);
  }
}

function acceptUbicacion(next: Session, propuesto: Propuesto): HandlerResult {
  next.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID] = propuesto.id;
  next.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_CODIGO] = propuesto.codigoRenipress;
  next.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_NOMBRE] = propuesto.nombre;
  return continueAfterUbicacion(next, ubicacionAceptadaText(propuesto.nombre));
}

function continueAfterUbicacion(next: Session, acknowledgement: string): HandlerResult {
  for (const key of [SlotKey.INCIDENCIA_ESTABLECIMIENTO_PROPUESTO, SlotKey.INCIDENCIA_UBICACION_TEXTO]) {
    next.slots = omitSlot(next.slots, key);
  }
  next.counters = omitCounter(next.counters);
  next.state = SessionState.INCIDENCIA_IDENTITY_CHOICE;
  return buildResult(next, [sendText(acknowledgement), sendButtons(IDENTITY_QUESTION_TEXT, INCIDENCIA_IDENTIDAD_BUTTONS)]);
}

function omitCounter(counters: Session["counters"]): Session["counters"] {
  return Object.fromEntries(Object.entries(counters).filter(([key]) => key !== CounterKey.INCIDENCIA_UBICACION_INTENTOS));
}

function askAgain(next: Session, message: string): HandlerResult {
  next.state = SessionState.INCIDENCIA_AWAITING_UBICACION;
  return buildResult(next, [sendText(message)]);
}

export function handleConfirmUbicacion(session: Session, event: InboundEvent): HandlerResult {
  const propuesto = readPropuesto(session);
  const answer = propuesto ? readConfirmation(event, IncidenciaButtonId.UBICACION_SI, IncidenciaButtonId.UBICACION_NO) : Confirmation.NO;
  const next = cloneSession(session);

  if (answer === Confirmation.YES && propuesto) return acceptUbicacion(next, propuesto);
  if (answer === Confirmation.NO) return failedAttempt(next, UBICACION_RECHAZADA_TEXT);

  return withRejectionNotice(buildResult(session, [sendButtons(UBICACION_CONFIRM_RETRY_TEXT, UBICACION_BUTTONS)]));
}

export function askUbicacionAgain(session: Session): HandlerResult {
  return buildResult(cloneSession(session), [sendText(ASK_OTRA_UBICACION_TEXT)]);
}

export function resendConfirmUbicacion(session: Session): HandlerResult {
  const propuesto = readPropuesto(session);
  if (!propuesto) return askUbicacionAgain(session);
  const distrito = propuesto.distrito ? ubicacionDistritoLineText(propuesto.distrito) : "";
  return buildResult(cloneSession(session), [
    sendButtons(confirmUbicacionText(propuesto.nombre, propuesto.codigoRenipress, distrito), UBICACION_BUTTONS),
  ]);
}

export function askIdentityChoice(session: Session): HandlerResult {
  return buildResult(cloneSession(session), [sendButtons(IDENTITY_QUESTION_TEXT, INCIDENCIA_IDENTIDAD_BUTTONS)]);
}

export function offerOmitir(next: Session, lead: string): HandlerResult {
  next.state = SessionState.INCIDENCIA_CONFIRM_OMITIR;
  const question = OMITIR_QUESTION_TEXT;
  return buildResult(next, [sendButtons([lead, question].filter(Boolean).join(" "), OMITIR_BUTTONS)]);
}

export function handleConfirmOmitir(session: Session, event: InboundEvent): HandlerResult {
  const answer = readConfirmation(event, IncidenciaButtonId.OMITIR_SI, IncidenciaButtonId.OMITIR_NO);
  const next = cloneSession(session);

  if (answer === Confirmation.YES) {
    for (const key of [
      SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID,
      SlotKey.INCIDENCIA_ESTABLECIMIENTO_CODIGO,
      SlotKey.INCIDENCIA_ESTABLECIMIENTO_NOMBRE,
    ]) {
      next.slots = omitSlot(next.slots, key);
    }
    return continueAfterUbicacion(next, OMITIR_ACEPTADO_TEXT);
  }
  if (answer === Confirmation.NO) {
    next.counters = omitCounter(next.counters);
    return askAgain(next, ASK_OTRA_UBICACION_TEXT);
  }
  return withRejectionNotice(buildResult(session, [sendButtons(OMITIR_RETRY_TEXT, OMITIR_BUTTONS)]));
}
