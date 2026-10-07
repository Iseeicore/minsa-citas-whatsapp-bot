import type { Mensaje, Usuario } from "@prisma/client";
import { ConversationStatus } from "@/lib/enums/conversation-status";
import { DireccionMensajeId } from "@/lib/enums/direccion-mensaje-id";
import { EstadoConversacionId } from "@/lib/enums/estado-conversacion-id";
import { EstadoMensajeId } from "@/lib/enums/estado-mensaje-id";
import { MessageDirection } from "@/lib/enums/message-direction";
import { MessageStatus } from "@/lib/enums/message-status";
import { MessageType } from "@/lib/enums/message-type";
import { TipoMensajeId } from "@/lib/enums/tipo-mensaje-id";

const ESTADO_CONVERSACION: Record<EstadoConversacionId, ConversationStatus> = {
  [EstadoConversacionId.ABIERTA]: ConversationStatus.OPEN,
  [EstadoConversacionId.CERRADA]: ConversationStatus.CLOSED,
};

const DIRECCION: Record<DireccionMensajeId, MessageDirection> = {
  [DireccionMensajeId.ENTRANTE]: MessageDirection.INBOUND,
  [DireccionMensajeId.SALIENTE]: MessageDirection.OUTBOUND,
};

const TIPO: Record<TipoMensajeId, MessageType> = {
  [TipoMensajeId.TEXTO]: MessageType.TEXT,
  [TipoMensajeId.IMAGEN]: MessageType.IMAGE,
  [TipoMensajeId.AUDIO]: MessageType.AUDIO,
  [TipoMensajeId.DOCUMENTO]: MessageType.DOCUMENT,
  [TipoMensajeId.UBICACION]: MessageType.LOCATION,
  [TipoMensajeId.PLANTILLA]: MessageType.TEMPLATE,
  [TipoMensajeId.DESCONOCIDO]: MessageType.UNKNOWN,
};

const ESTADO_MENSAJE: Record<EstadoMensajeId, MessageStatus> = {
  [EstadoMensajeId.PENDIENTE]: MessageStatus.PENDING,
  [EstadoMensajeId.ENVIADO]: MessageStatus.SENT,
  [EstadoMensajeId.ENTREGADO]: MessageStatus.DELIVERED,
  [EstadoMensajeId.LEIDO]: MessageStatus.READ,
  [EstadoMensajeId.FALLIDO]: MessageStatus.FAILED,
};

export const toConversationStatus = (id: number): ConversationStatus =>
  ESTADO_CONVERSACION[id as EstadoConversacionId] ?? ConversationStatus.OPEN;

/** Contrato que consume la bandeja web: conserva los nombres y valores de la API anterior (la UI no cambia). */
export function toConversationDto(usuario: Usuario) {
  return {
    id: usuario.id,
    waId: usuario.waId,
    phoneNumber: usuario.phoneNumber,
    profileName: usuario.profileName,
    status: toConversationStatus(usuario.estadoConversacionId),
    lastMessageAt: usuario.ultimoMensajeEn,
    createdAt: usuario.fechaCreacion,
  };
}

export function toMessageDto(mensaje: Mensaje) {
  return {
    id: mensaje.id,
    conversationId: mensaje.usuarioId,
    direction: DIRECCION[mensaje.direccionMensajeId as DireccionMensajeId],
    type: TIPO[mensaje.tipoMensajeId as TipoMensajeId] ?? MessageType.UNKNOWN,
    content: mensaje.contenido,
    mediaUrl: mensaje.mediaId,
    waMessageId: mensaje.waMessageId,
    status: ESTADO_MENSAJE[mensaje.estadoMensajeId as EstadoMensajeId],
    timestamp: mensaje.fechaHora,
    createdAt: mensaje.fechaCreacion,
  };
}
