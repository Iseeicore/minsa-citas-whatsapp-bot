import { readConfirmation } from "@/lib/fsm/flows/incidencia/confirmation";
import { buildResult, cloneSession, query, sendButtons, sendText, withRejectionNotice } from "@/lib/fsm/core/handlers-shared";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { Confirmation } from "@/lib/enums/confirmation";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import {
  ASK_DESCRIPCION_TEXT,
  FOTO_REQUEST_TEXT,
  FOTO_BUTTONS,
  RESUMEN_LISTO_TEXT,
  RESUMEN_ANONIMO_TEXT,
  RESUMEN_DECLARACION_TEXT,
  CONFIRM_REGISTRO_BUTTONS,
  ENVIANDO_INCIDENCIA_TEXT,
  resumenEstablecimientoText,
  resumenRelatoText,
  resumenNombreText,
  INCIDENCIA_CANCELADA_TEXT,
} from "@/lib/constants/textos/incidencia";
import { slotText } from "@/lib/fsm/core/slot-readers";

export function askFoto() {
  return sendButtons(FOTO_REQUEST_TEXT, FOTO_BUTTONS);
}

export function askDescripcion(): string {
  return ASK_DESCRIPCION_TEXT;
}

export function submitIncidencia(session: Session, from: string): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_SUBMIT_PENDING;

  const submission = {
    waId: from,
    dni: next.slots[SlotKey.DNI] ?? null,
    nombreCompleto: next.slots[SlotKey.NOMBRE_COMPLETO] ?? null,
    descripcion: next.slots[SlotKey.DESCRIPCION_INCIDENCIA],
    establecimientoId: next.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID] ?? null,
  };

  return buildResult(next, [sendText(ENVIANDO_INCIDENCIA_TEXT), query(QueryKind.INCIDENCIA_REGISTER, { submission })]);
}

export function afterDescripcion(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_AWAITING_FOTO;
  return buildResult(next, [askFoto()]);
}

function resumenRegistro(session: Session): string {
  const descripcion = slotText(session.slots, SlotKey.DESCRIPCION_INCIDENCIA);
  const establecimiento = session.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_NOMBRE];
  const nombre = session.slots[SlotKey.NOMBRE_COMPLETO];

  const lineas = [
    RESUMEN_LISTO_TEXT,
    establecimiento ? resumenEstablecimientoText(establecimiento) : undefined,
    resumenRelatoText(descripcion),
    nombre ? resumenNombreText(nombre) : RESUMEN_ANONIMO_TEXT,
    "",
    RESUMEN_DECLARACION_TEXT,
  ];
  return lineas.filter((linea) => linea !== undefined).join("\n");
}

export function askConfirmRegistro(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_CONFIRM_REGISTRO;
  return buildResult(next, [sendButtons(resumenRegistro(next), CONFIRM_REGISTRO_BUTTONS)]);
}

export function handleConfirmRegistro(session: Session, event: InboundEvent): HandlerResult {
  const answer = readConfirmation(event, IncidenciaButtonId.CONFIRM_REGISTRO_SI, IncidenciaButtonId.CONFIRM_REGISTRO_NO);

  if (answer === Confirmation.YES) return submitIncidencia(session, event.from);

  if (answer === Confirmation.NO) {
    return buildResult({ state: SessionState.INCIDENCIA_CANCELLED, slots: {}, counters: {} }, [sendText(INCIDENCIA_CANCELADA_TEXT)]);
  }

  return withRejectionNotice(buildResult(session, [sendButtons(resumenRegistro(session), CONFIRM_REGISTRO_BUTTONS)]));
}
