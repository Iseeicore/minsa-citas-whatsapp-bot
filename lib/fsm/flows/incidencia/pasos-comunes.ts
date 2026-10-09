import { isMediaStorageConfigured } from "@/lib/recepcion/imagenes/config";
import { buildResult, cloneSession, query, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

export const FOTO_REQUEST_TEXT =
  "Para poder registrar tu incidencia necesitamos una imagen. ¿Deseas compartírnosla? Envíala ahora, o cuéntanos si prefieres continuar sin foto (también podés escribir OMITIR).";
export const UNREADABLE_TEXT_RETRY = "No pudimos leer eso — ¿podrías escribirlo de nuevo?";

export function askDescripcion(): string {
  return "Cuéntanos tu incidencia (hasta 1000 caracteres).";
}

export function submitIncidencia(session: Session, from: string, mediaDataUri?: string): HandlerResult {
  const next = cloneSession(session);
  if (mediaDataUri) next.slots[SlotKey.MEDIA_DATA_URI] = mediaDataUri;
  next.state = SessionState.INCIDENCIA_SUBMIT_PENDING;

  const submission = {
    waId: from,
    dni: next.slots[SlotKey.DNI] ?? null,
    nombreCompleto: next.slots[SlotKey.NOMBRE_COMPLETO] ?? null,
    descripcion: next.slots[SlotKey.DESCRIPCION_INCIDENCIA],
    mediaDataUri: next.slots[SlotKey.MEDIA_DATA_URI] ?? undefined,
  };

  return buildResult(next, [
    sendText("Enviando tu incidencia…"),
    query(QueryKind.INCIDENCIA_REGISTER, { submission }),
  ]);
}

/** Con el relato ya guardado en el slot: pide la foto si hay servicio de imágenes y, si no, registra la incidencia. */
export function afterDescripcion(session: Session, from: string): HandlerResult {
  if (!isMediaStorageConfigured()) return submitIncidencia(session, from);
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_AWAITING_FOTO;
  return buildResult(next, [sendText(FOTO_REQUEST_TEXT)]);
}
