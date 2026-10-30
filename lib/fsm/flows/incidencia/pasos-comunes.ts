import { readConfirmation } from "@/lib/fsm/flows/incidencia/confirmation";
import { buildResult, cloneSession, query, sendButtons, sendText, withRejectionNotice } from "@/lib/fsm/core/handlers-shared";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { Confirmation } from "@/lib/enums/confirmation";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import {
  ASK_DESCRIPCION_ANONIMO_TEXT,
  askDescripcionConDocumentoText,
  fotoRequestText,
  FOTO_BUTTONS,
  RESUMEN_LISTO_TEXT,
  RESUMEN_ANONIMO_TEXT,
  RESUMEN_DECLARACION_TEXT,
  CONFIRM_REGISTRO_BUTTONS,
  resumenEstablecimientoText,
  resumenRelatoText,
  resumenDocumentoText,
  resumenImagenesText,
  INCIDENCIA_CANCELADA_TEXT,
} from "@/lib/constants/textos/incidencia";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { channelOf } from "@/lib/fsm/core/channel";
import { DOCUMENTO_DIGITOS_VISIBLES } from "@/lib/constants/limits/identity";
import { readImagenes } from "@/lib/fsm/flows/incidencia/imagenes";
import { renderWithinLength } from "@/lib/utils/fit-text";
import { formatMegabytes } from "@/lib/utils/format-megabytes";
import { maskDocumento } from "@/lib/utils/mask-documento";
import { WHATSAPP_INTERACTIVE_BODY_MAX } from "@/lib/constants/limits/whatsapp";
import { MAX_IMAGE_BYTES } from "@/lib/recepcion/imagenes/data-uri";

export const MAX_IMAGEN_LEGIBLE = formatMegabytes(MAX_IMAGE_BYTES);

export function askFoto() {
  return sendButtons(fotoRequestText(MAX_IMAGEN_LEGIBLE), FOTO_BUTTONS);
}

export function askDescripcion(session: Session): string {
  const documento = slotText(session.slots, SlotKey.DNI);
  return documento ? askDescripcionConDocumentoText(maskDocumento(documento)) : ASK_DESCRIPCION_ANONIMO_TEXT;
}

export function submitIncidencia(session: Session, from: string): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_SUBMIT_PENDING;

  const submission = {
    waId: from,
    dni: next.slots[SlotKey.DNI] ?? null,
    descripcion: next.slots[SlotKey.DESCRIPCION_INCIDENCIA],
    establecimientoId: next.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID] ?? null,
    mediaDataUris: readImagenes(next.slots),
    canal: channelOf(next),
  };

  return buildResult(next, [query(QueryKind.INCIDENCIA_REGISTER, { submission })]);
}

export function afterDescripcion(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_AWAITING_FOTO;
  return buildResult(next, [askFoto()]);
}

function resumenRegistro(session: Session): string {
  const descripcion = slotText(session.slots, SlotKey.DESCRIPCION_INCIDENCIA);
  const establecimiento = slotText(session.slots, SlotKey.INCIDENCIA_ESTABLECIMIENTO_NOMBRE);
  const documento = slotText(session.slots, SlotKey.DNI);
  const imagenes = readImagenes(session.slots).length;

  const render = ([relatoMostrado, establecimientoMostrado]: string[]): string =>
    [
      RESUMEN_LISTO_TEXT,
      establecimiento ? resumenEstablecimientoText(establecimientoMostrado) : undefined,
      resumenRelatoText(relatoMostrado),
      documento ? resumenDocumentoText(documento.slice(-DOCUMENTO_DIGITOS_VISIBLES)) : RESUMEN_ANONIMO_TEXT,
      imagenes > 0 ? resumenImagenesText(imagenes) : undefined,
      "",
      RESUMEN_DECLARACION_TEXT,
    ]
      .filter((linea) => linea !== undefined)
      .join("\n");

  return renderWithinLength([descripcion, establecimiento], render, WHATSAPP_INTERACTIVE_BODY_MAX);
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
