import { buildResult, cloneSession, query, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

export const FOTO_REQUEST_TEXT =
  "¿Quieres enviar una imagen o un archivo como evidencia? Es opcional: envíalo ahora, o escribe OMITIR para continuar sin él.";
export const EVIDENCIA_ACK_TEXT = "Ok, se registró tu evidencia.";
export const UNREADABLE_TEXT_RETRY = "No pudimos leer eso — ¿podrías escribirlo de nuevo?";

export function askDescripcion(): string {
  return "Cuéntanos tu incidencia (hasta 1000 caracteres).";
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

  return buildResult(next, [sendText("Enviando tu incidencia…"), query(QueryKind.INCIDENCIA_REGISTER, { submission })]);
}

/** Con el relato ya guardado en el slot: ofrece enviar una evidencia. Ningún archivo se guarda en esta instancia. */
export function afterDescripcion(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_AWAITING_FOTO;
  return buildResult(next, [sendText(FOTO_REQUEST_TEXT)]);
}
