import type { BuscarEstablecimientoResult } from "@/lib/establecimientos/buscar";
import { decidirCandidatos, MAX_EN_LISTA, type Candidato, type Establecimiento } from "@/lib/establecimientos/decidir";
import { UNREADABLE_TEXT_RETRY } from "@/lib/fsm/flows/incidencia/pasos-comunes";
import {
  buildResult,
  cloneSession,
  omitSlot,
  query,
  readReply,
  sendButtons,
  sendList,
  sendText,
  truncateForRow,
  WHATSAPP_ROW_DESCRIPTION_MAX,
} from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { INCIDENCIA_NOMBRE_BUTTONS } from "@/lib/fsm/routing/flow-entry";
import { parseCodigoSuelto, type InicioIncidencia } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { quiereOmitirUbicacion } from "@/lib/fsm/parsing/text/omitir-ubicacion";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { looksLikeNoise } from "@/lib/security/text-noise";
import { Confirmation } from "@/lib/enums/confirmation";
import { CounterKey } from "@/lib/enums/counter-key";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

export const MAX_INTENTOS_UBICACION = 3;
export const NINGUNO_ROW_ID = "ninguno";

const PEDIR_UBICACION = "¿En qué establecimiento de salud ocurrió? Escribe su nombre o su código IPRESS.";
const PEDIR_OTRO = "Escribe el nombre del establecimiento o su código IPRESS.";
const IDENTITY_QUESTION = "¿Deseas registrar tu nombre, o prefieres que sea anónimo?";

export const UBICACION_BUTTONS = [
  { id: IncidenciaButtonId.UBICACION_SI, title: "Sí, es ese" },
  { id: IncidenciaButtonId.UBICACION_NO, title: "No, es otro" },
];

export const OMITIR_BUTTONS = [
  { id: IncidenciaButtonId.OMITIR_SI, title: "Sí, continuar" },
  { id: IncidenciaButtonId.OMITIR_NO, title: "No, indicarlo" },
];

type Propuesto = { id: number; areaId: number; codigoRenipress: string; nombre: string; distrito: string | null };

const toPropuesto = (establecimiento: Establecimiento): Propuesto => ({
  id: establecimiento.id,
  areaId: establecimiento.areaId,
  codigoRenipress: establecimiento.codigoRenipress,
  nombre: establecimiento.nombre,
  distrito: establecimiento.distrito,
});

function readPropuesto(session: Session, key: SlotKey.INCIDENCIA_ESTABLECIMIENTO_PROPUESTO | SlotKey.INCIDENCIA_CANDIDATOS): unknown {
  const raw = session.slots[key];
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function leadIn(lead: string): string {
  return [lead, "Vamos a registrar tu incidencia."].filter(Boolean).join(" ");
}

function searching(next: Session, payload: { codigo?: string; nombre?: string }): HandlerResult {
  next.state = SessionState.INCIDENCIA_UBICACION_PENDING;
  return buildResult(next, [query(QueryKind.BUSCAR_ESTABLECIMIENTO, payload)]);
}

/**
 * Entrada común a la incidencia: desde el QR, desde un texto que la anuncia, desde el menú o desde un atajo. Si trae código
 * o nombre del establecimiento los busca de inmediato; si no, pide la ubicación. Lo que la persona ya escribió queda de borrador.
 */
export function beginIncidencia(slots: Session["slots"], lead: string, inicio: InicioIncidencia | null = null): HandlerResult {
  const next: Session = { state: SessionState.INCIDENCIA_AWAITING_UBICACION, slots: { ...slots }, counters: {} };
  next.slots[SlotKey.INCIDENCIA_ORIGEN] = inicio?.origen ?? "menu";
  if (inicio?.resto) next.slots[SlotKey.INCIDENCIA_BORRADOR] = inicio.resto;

  if (inicio?.codigoRenipress) {
    if (inicio.nombre) next.slots[SlotKey.INCIDENCIA_UBICACION_TEXTO] = inicio.nombre;
    return searching(next, { codigo: inicio.codigoRenipress });
  }
  if (inicio?.nombre) return searching(next, { nombre: inicio.nombre });
  return buildResult(next, [sendText(`${leadIn(lead)} ${PEDIR_UBICACION}`)]);
}

export function handleAwaitingUbicacion(session: Session, event: InboundEvent): HandlerResult {
  const text = (event.text ?? "").trim();
  if (!text) return buildResult(session, [sendText(PEDIR_OTRO)]);
  if (quiereOmitirUbicacion(text)) return offerOmitir(cloneSession(session), "");

  const codigo = parseCodigoSuelto(text);
  if (!codigo && looksLikeNoise(text)) return buildResult(session, [sendText(UNREADABLE_TEXT_RETRY)]);
  return searching(cloneSession(session), codigo ? { codigo } : { nombre: text });
}

function failedAttempt(next: Session, message: string): HandlerResult {
  const attempts = (next.counters[CounterKey.INCIDENCIA_UBICACION_INTENTOS] ?? 0) + 1;
  next.counters[CounterKey.INCIDENCIA_UBICACION_INTENTOS] = attempts;
  if (attempts >= MAX_INTENTOS_UBICACION) return offerOmitir(next, "Disculpa, no logramos ubicar el establecimiento.");
  next.state = SessionState.INCIDENCIA_AWAITING_UBICACION;
  return buildResult(next, [sendText(message)]);
}

function confirmUbicacion(next: Session, establecimiento: Establecimiento): HandlerResult {
  next.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_PROPUESTO] = JSON.stringify(toPropuesto(establecimiento));
  next.state = SessionState.INCIDENCIA_CONFIRM_UBICACION;
  const distrito = establecimiento.distrito ? `\nDistrito: ${establecimiento.distrito}` : "";
  return buildResult(next, [
    sendButtons(
      `¿Estás seguro de esa ubicación?\n\n*${establecimiento.nombre}*\nCódigo IPRESS: ${establecimiento.codigoRenipress}${distrito}`,
      UBICACION_BUTTONS,
    ),
  ]);
}

function offerList(next: Session, candidatos: Candidato[]): HandlerResult {
  next.slots[SlotKey.INCIDENCIA_CANDIDATOS] = JSON.stringify(candidatos.map(toPropuesto));
  next.state = SessionState.INCIDENCIA_SELECT_UBICACION;
  const rows = candidatos.slice(0, MAX_EN_LISTA).map((candidato) => ({
    id: candidato.codigoRenipress,
    title: `IPRESS ${candidato.codigoRenipress}`,
    description: truncateForRow(candidato.nombre, WHATSAPP_ROW_DESCRIPTION_MAX),
  }));
  rows.push({ id: NINGUNO_ROW_ID, title: "Ninguno de estos", description: "Escribiré otro nombre o código" });
  return buildResult(next, [sendList("Encontré estos establecimientos. Elige el correcto:", rows)]);
}

export function handleUbicacionPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as BuscarEstablecimientoResult;
  const next = cloneSession(session);

  if (result.status === "unavailable") {
    return offerOmitir(next, "No pudimos buscar el establecimiento en este momento.");
  }

  if (result.by === "codigo") {
    if (result.status === "found") return confirmUbicacion(next, result.establecimiento);
    const nombre = next.slots[SlotKey.INCIDENCIA_UBICACION_TEXTO];
    if (nombre) {
      next.slots = omitSlot(next.slots, SlotKey.INCIDENCIA_UBICACION_TEXTO);
      return searching(next, { nombre });
    }
    return failedAttempt(next, `No encontré ese código. ${PEDIR_OTRO}`);
  }

  if (result.by !== "nombre" || result.status !== "ok") return failedAttempt(next, `No pudimos leer eso. ${PEDIR_OTRO}`);

  const decision = decidirCandidatos(result.candidatos);
  if (next.slots[SlotKey.INCIDENCIA_ORIGEN] === "texto" && decision.kind !== "ninguno") {
    next.slots = omitSlot(next.slots, SlotKey.INCIDENCIA_BORRADOR);
  }

  switch (decision.kind) {
    case "uno":
      return confirmUbicacion(next, decision.establecimiento);
    case "lista":
      return offerList(next, decision.candidatos);
    case "muchos":
      return failedAttempt(next, `Hay varios establecimientos que se parecen. Escribe su nombre completo o su código IPRESS.`);
    default:
      return failedAttempt(next, `No encontré ese establecimiento. Escribe su nombre completo o su código IPRESS.`);
  }
}

function acceptUbicacion(next: Session, propuesto: Propuesto): HandlerResult {
  next.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID] = propuesto.id;
  next.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_CODIGO] = propuesto.codigoRenipress;
  next.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_NOMBRE] = propuesto.nombre;
  return continueAfterUbicacion(next, `Perfecto, registraremos tu incidencia en *${propuesto.nombre}*.`);
}

function continueAfterUbicacion(next: Session, acknowledgement: string): HandlerResult {
  for (const key of [SlotKey.INCIDENCIA_ESTABLECIMIENTO_PROPUESTO, SlotKey.INCIDENCIA_CANDIDATOS, SlotKey.INCIDENCIA_UBICACION_TEXTO]) {
    next.slots = omitSlot(next.slots, key);
  }
  next.counters = omitCounter(next.counters);
  next.state = SessionState.INCIDENCIA_IDENTITY_CHOICE;
  return buildResult(next, [sendText(acknowledgement), sendButtons(IDENTITY_QUESTION, INCIDENCIA_NOMBRE_BUTTONS)]);
}

function omitCounter(counters: Session["counters"]): Session["counters"] {
  return Object.fromEntries(Object.entries(counters).filter(([key]) => key !== CounterKey.INCIDENCIA_UBICACION_INTENTOS));
}

function askAgain(next: Session, message: string): HandlerResult {
  next.state = SessionState.INCIDENCIA_AWAITING_UBICACION;
  return buildResult(next, [sendText(message)]);
}

function readConfirmation(event: InboundEvent, yes: IncidenciaButtonId, no: IncidenciaButtonId): Confirmation | undefined {
  const reply = readReply(event);
  if (reply === yes) return Confirmation.YES;
  if (reply === no) return Confirmation.NO;
  const typed = (event.text ?? "").trim();
  if (!typed) return undefined;
  const resolved = resolveConfirmation(typed);
  return resolved === Confirmation.YES || resolved === Confirmation.NO ? resolved : undefined;
}

export function handleConfirmUbicacion(session: Session, event: InboundEvent): HandlerResult {
  const propuesto = readPropuesto(session, SlotKey.INCIDENCIA_ESTABLECIMIENTO_PROPUESTO) as Propuesto | undefined;
  const answer = propuesto ? readConfirmation(event, IncidenciaButtonId.UBICACION_SI, IncidenciaButtonId.UBICACION_NO) : Confirmation.NO;
  const next = cloneSession(session);

  if (answer === Confirmation.YES && propuesto) return acceptUbicacion(next, propuesto);
  if (answer === Confirmation.NO) return failedAttempt(next, `Entendido. ${PEDIR_OTRO}`);

  return buildResult(session, [
    sendButtons("¿Es ese el establecimiento donde ocurrió? Toca Sí o No.", UBICACION_BUTTONS),
  ]);
}

export function handleSelectUbicacion(session: Session, event: InboundEvent): HandlerResult {
  const candidatos = (readPropuesto(session, SlotKey.INCIDENCIA_CANDIDATOS) as Propuesto[] | undefined) ?? [];
  const reply = readReply(event)?.trim();
  const next = cloneSession(session);

  const chosen = candidatos.find((candidato) => candidato.codigoRenipress === reply);
  if (chosen) return acceptUbicacion(next, chosen);

  if (reply === NINGUNO_ROW_ID || (event.text && quiereOmitirUbicacion(event.text))) {
    return failedAttempt(next, `Entendido. ${PEDIR_OTRO}`);
  }

  const typed = (event.text ?? "").trim();
  if (!typed) return buildResult(session, [sendText("Elige un establecimiento de la lista o escribe otro nombre o código IPRESS.")]);
  return handleAwaitingUbicacion(next, event);
}

function offerOmitir(next: Session, lead: string): HandlerResult {
  next.state = SessionState.INCIDENCIA_CONFIRM_OMITIR;
  const question = "¿Quieres continuar sin indicar el establecimiento?";
  return buildResult(next, [sendButtons([lead, question].filter(Boolean).join(" "), OMITIR_BUTTONS)]);
}

export function handleConfirmOmitir(session: Session, event: InboundEvent): HandlerResult {
  const answer = readConfirmation(event, IncidenciaButtonId.OMITIR_SI, IncidenciaButtonId.OMITIR_NO);
  const next = cloneSession(session);

  if (answer === Confirmation.YES) {
    for (const key of [SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID, SlotKey.INCIDENCIA_ESTABLECIMIENTO_CODIGO, SlotKey.INCIDENCIA_ESTABLECIMIENTO_NOMBRE]) {
      next.slots = omitSlot(next.slots, key);
    }
    return continueAfterUbicacion(next, "Entendido, seguiremos sin indicar el establecimiento.");
  }
  if (answer === Confirmation.NO) {
    next.counters = omitCounter(next.counters);
    return askAgain(next, PEDIR_OTRO);
  }
  return buildResult(session, [sendButtons("¿Quieres continuar sin indicar el establecimiento? Toca Sí o No.", OMITIR_BUTTONS)]);
}
