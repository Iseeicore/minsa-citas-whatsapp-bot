import { z } from "zod";
import type { BuscarEstablecimientoResult } from "@/lib/establecimientos/buscar";
import type { Establecimiento } from "@/lib/establecimientos/decidir";
import {
  buildResult,
  cloneSession,
  omitSlot,
  query,
  readTrimmedText,
  sendButtons,
  sendText,
  withRejectionNotice,
} from "@/lib/fsm/core/handlers-shared";
import { getSlotJsonOr, readSlotJson } from "@/lib/fsm/core/slot-readers";
import type { HandlerResult, InboundEvent, QueryResultEvent, SendButtonsEffect, Session } from "@/lib/fsm/core/types";
import { closeConsulta, closeExhausted } from "@/lib/fsm/flows/consulta/cierre";
import { askDni, startSearch } from "@/lib/fsm/flows/consulta/resultado";
import { readConfirmation } from "@/lib/fsm/flows/incidencia/confirmation";
import { parseEstablecimientoQuery, toEstablecimientoResolucion } from "@/lib/fsm/flows/shared/establecimiento-resolver";
import {
  ASK_ESTABLECIMIENTO_TEXT,
  CONSULTA_ESTABLECIMIENTO_BUTTONS,
  CONSULTA_FALLA_TEXT,
  ESTABLECIMIENTO_AGOTADO_TEXT,
  ESTABLECIMIENTO_ILEGIBLE_TEXT,
  ESTABLECIMIENTO_NO_ENCONTRADO_TEXT,
  ESTABLECIMIENTO_RECHAZADO_TEXT,
  ESTABLECIMIENTO_VARIOS_TEXT,
  confirmEstablecimientoText,
} from "@/lib/constants/textos/consulta";
import { MAX_INTENTOS_ESTABLECIMIENTO } from "@/lib/constants/limits/consulta";
import { Confirmation } from "@/lib/enums/confirmation";
import { ConsultaEstablecimientoButtonId } from "@/lib/enums/consulta-establecimiento-button-id";
import { CounterKey } from "@/lib/enums/counter-key";
import { EstablecimientoResolucion } from "@/lib/enums/establecimiento-resolucion";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

type Propuesto = Pick<Establecimiento, "id" | "nombre" | "codigoRenipress">;

const PROPUESTO_SCHEMA = z.object({ id: z.number(), nombre: z.string(), codigoRenipress: z.string() });

const REINTENTO_POR_RESOLUCION: Readonly<Record<EstablecimientoResolucion.VARIOS | EstablecimientoResolucion.NINGUNO, string>> = {
  [EstablecimientoResolucion.VARIOS]: ESTABLECIMIENTO_VARIOS_TEXT,
  [EstablecimientoResolucion.NINGUNO]: ESTABLECIMIENTO_NO_ENCONTRADO_TEXT,
};

function findPropuesto(session: Session): Propuesto | undefined {
  return getSlotJsonOr<Propuesto | undefined>(
    readSlotJson(session.slots, SlotKey.CONSULTA_ESTABLECIMIENTO_PROPUESTO, PROPUESTO_SCHEMA),
    undefined,
  );
}

function buildConfirmEffect(propuesto: Propuesto): SendButtonsEffect {
  return sendButtons(confirmEstablecimientoText(propuesto.nombre, propuesto.codigoRenipress), CONSULTA_ESTABLECIMIENTO_BUTTONS);
}

function retryEstablecimiento(session: Session, text: string): HandlerResult {
  const next = cloneSession(session);
  next.slots = omitSlot(next.slots, SlotKey.CONSULTA_ESTABLECIMIENTO_PROPUESTO);
  const attempts = (next.counters[CounterKey.CONSULTA_INTENTOS_ESTABLECIMIENTO] ?? 0) + 1;
  next.counters[CounterKey.CONSULTA_INTENTOS_ESTABLECIMIENTO] = attempts;
  if (attempts >= MAX_INTENTOS_ESTABLECIMIENTO) return closeExhausted(next, ESTABLECIMIENTO_AGOTADO_TEXT);

  next.state = SessionState.CONSULTA_AWAITING_ESTABLECIMIENTO;
  return buildResult(next, [sendText(text)]);
}

function proposeEstablecimiento(session: Session, establecimiento: Establecimiento): HandlerResult {
  const propuesto: Propuesto = { id: establecimiento.id, nombre: establecimiento.nombre, codigoRenipress: establecimiento.codigoRenipress };
  const next = cloneSession(session);
  next.slots[SlotKey.CONSULTA_ESTABLECIMIENTO_PROPUESTO] = JSON.stringify(propuesto);
  next.state = SessionState.CONSULTA_CONFIRM_ESTABLECIMIENTO;
  return buildResult(next, [buildConfirmEffect(propuesto)]);
}

function acceptEstablecimiento(session: Session, propuesto: Propuesto): HandlerResult {
  const next = cloneSession(session);
  next.slots = omitSlot(next.slots, SlotKey.CONSULTA_ESTABLECIMIENTO_PROPUESTO);
  next.slots[SlotKey.CONSULTA_ESTABLECIMIENTO_ID] = propuesto.id;
  return next.slots[SlotKey.CONSULTA_ANONIMA] === true ? startSearch(next) : askDni(next);
}

export function askEstablecimiento(next: Session): HandlerResult {
  next.state = SessionState.CONSULTA_AWAITING_ESTABLECIMIENTO;
  return buildResult(next, [sendText(ASK_ESTABLECIMIENTO_TEXT)]);
}

export function handleAwaitingEstablecimiento(session: Session, event: InboundEvent): HandlerResult {
  const text = readTrimmedText(event);
  if (!text) return buildResult(session, [sendText(ASK_ESTABLECIMIENTO_TEXT)]);
  const busqueda = parseEstablecimientoQuery(text);
  if (!busqueda) return buildResult(session, [sendText(ESTABLECIMIENTO_ILEGIBLE_TEXT)]);

  const next = cloneSession(session);
  next.state = SessionState.CONSULTA_BUSCAR_ESTABLECIMIENTO_PENDING;
  return buildResult(next, [query(QueryKind.BUSCAR_ESTABLECIMIENTO, busqueda)]);
}

export function handleBuscarEstablecimientoPending(session: Session, event: QueryResultEvent): HandlerResult {
  const resolucion = toEstablecimientoResolucion(event.result as BuscarEstablecimientoResult);
  if (resolucion.kind === EstablecimientoResolucion.NO_DISPONIBLE) return closeConsulta(SessionState.CONSULTA_FAILED, CONSULTA_FALLA_TEXT);
  if (resolucion.kind === EstablecimientoResolucion.UNO) return proposeEstablecimiento(session, resolucion.establecimiento);
  return retryEstablecimiento(session, REINTENTO_POR_RESOLUCION[resolucion.kind]);
}

export function handleConfirmEstablecimiento(session: Session, event: InboundEvent): HandlerResult {
  const propuesto = findPropuesto(session);
  const answer = propuesto
    ? readConfirmation(event, ConsultaEstablecimientoButtonId.SI, ConsultaEstablecimientoButtonId.NO)
    : Confirmation.NO;

  if (!propuesto || answer === Confirmation.NO) return retryEstablecimiento(session, ESTABLECIMIENTO_RECHAZADO_TEXT);
  if (answer === Confirmation.YES) return acceptEstablecimiento(session, propuesto);
  return withRejectionNotice(buildResult(session, [buildConfirmEffect(propuesto)]));
}
