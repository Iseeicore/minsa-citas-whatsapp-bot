import { EstadoMensajeId } from "@/lib/enums/estado-mensaje-id";
import { TipoMensajeId } from "@/lib/enums/tipo-mensaje-id";
import { downloadWhatsAppMediaAsDataUri } from "@/lib/whatsapp/whatsapp-media";
import type { InboundEvent, InboundMedia } from "@/lib/fsm/core/types";
import { MAX_IMAGENES_POR_INCIDENCIA } from "@/lib/constants/limits/incidencia";
import { MediaFailure } from "@/lib/enums/media-failure";
import { InboundMediaKind } from "@/lib/enums/inbound-media-kind";
import { WhatsAppMessageType } from "@/lib/enums/whatsapp-message-type";
import { SessionState } from "@/lib/enums/session-state";
import { SessionChannel } from "@/lib/enums/session-channel";
import { WhatsAppDeliveryStatus } from "@/lib/enums/whatsapp-delivery-status";

export type WhatsAppContact = {
  user_id: string;
  wa_id?: string;
  profile?: { name?: string };
};

export type WhatsAppMessage = {
  id: string;
  from_user_id: string;
  from?: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string };
  audio?: { id?: string };
  document?: { id?: string; filename?: string };
  location?: { latitude?: number; longitude?: number };
  system?: { type?: string; user_id?: string; previous_user_id?: string };
  interactive?: {
    button_reply?: { id: string; title?: string };
    list_reply?: { id: string; title?: string };
  };
  context?: { id?: string; from?: string };
};

type WhatsAppStatus = {
  id: string;
  status: string;
};

export type WhatsAppUserIdUpdate = {
  wa_id?: string;
  user_id?: { previous?: string; current?: string };
};

export type WhatsAppValue = {
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
  user_id_update?: WhatsAppUserIdUpdate[];
};

type WhatsAppEntry = {
  changes?: { value?: WhatsAppValue }[];
};

export type WhatsAppWebhookPayload = {
  entry?: WhatsAppEntry[];
};

type StoredContent = {
  content: string | undefined;
  mediaId: string | undefined;
};

const NO_STORED_CONTENT: StoredContent = { content: undefined, mediaId: undefined };

const ESTADO_POR_STATUS: Record<WhatsAppDeliveryStatus, EstadoMensajeId> = {
  [WhatsAppDeliveryStatus.SENT]: EstadoMensajeId.ENVIADO,
  [WhatsAppDeliveryStatus.DELIVERED]: EstadoMensajeId.ENTREGADO,
  [WhatsAppDeliveryStatus.READ]: EstadoMensajeId.LEIDO,
  [WhatsAppDeliveryStatus.FAILED]: EstadoMensajeId.FALLIDO,
};

const STORED_CONTENT_BY_TYPE: Partial<Record<WhatsAppMessageType, (message: WhatsAppMessage) => StoredContent>> = {
  [WhatsAppMessageType.TEXT]: (message) => ({ content: message.text?.body, mediaId: undefined }),
  [WhatsAppMessageType.IMAGE]: (message) => ({ content: message.image?.caption, mediaId: message.image?.id }),
  [WhatsAppMessageType.AUDIO]: (message) => ({ content: undefined, mediaId: message.audio?.id }),
  [WhatsAppMessageType.DOCUMENT]: (message) => ({ content: message.document?.filename, mediaId: message.document?.id }),
  [WhatsAppMessageType.LOCATION]: (message) => ({
    content:
      message.location?.latitude !== undefined && message.location?.longitude !== undefined
        ? `${message.location.latitude},${message.location.longitude}`
        : undefined,
    mediaId: undefined,
  }),
};

async function downloadEvidence(mediaIds: string[]): Promise<InboundMedia[]> {
  const downloaded = await Promise.all(mediaIds.slice(0, MAX_IMAGENES_POR_INCIDENCIA).map(downloadWhatsAppMediaAsDataUri));
  const overLimit = mediaIds
    .slice(MAX_IMAGENES_POR_INCIDENCIA)
    .map((): InboundMedia => ({ kind: InboundMediaKind.FAILURE, failure: MediaFailure.OVER_LIMIT }));
  return [...downloaded, ...overLimit];
}

export function mapMessageType(type: string): TipoMensajeId {
  switch (type) {
    case "text":
      return TipoMensajeId.TEXTO;
    case "image":
      return TipoMensajeId.IMAGEN;
    case "audio":
      return TipoMensajeId.AUDIO;
    case "document":
      return TipoMensajeId.DOCUMENTO;
    case "location":
      return TipoMensajeId.UBICACION;
    case "template":
      return TipoMensajeId.PLANTILLA;
    default:
      return TipoMensajeId.DESCONOCIDO;
  }
}

export function mapStatus(status: string): EstadoMensajeId | undefined {
  return Object.hasOwn(ESTADO_POR_STATUS, status) ? ESTADO_POR_STATUS[status as WhatsAppDeliveryStatus] : undefined;
}

export function extractContentAndMedia(message: WhatsAppMessage): StoredContent {
  const extract = Object.hasOwn(STORED_CONTENT_BY_TYPE, message.type)
    ? STORED_CONTENT_BY_TYPE[message.type as keyof typeof STORED_CONTENT_BY_TYPE]
    : undefined;
  return extract ? extract(message) : NO_STORED_CONTENT;
}

export function tapReplyTo(message: WhatsAppMessage): string | undefined {
  const tapped = message.type === "interactive" && (message.interactive?.button_reply || message.interactive?.list_reply);
  return tapped ? message.context?.id || undefined : undefined;
}

export async function toInboundEvent(
  waId: string,
  message: WhatsAppMessage,
  sessionState: string,
  mediaIds?: string[],
): Promise<InboundEvent | undefined> {
  if (message.type === "text") {
    return { from: waId, type: "text", text: message.text?.body, channel: SessionChannel.WHATSAPP };
  }

  if (message.type === "interactive") {
    const replyTo = tapReplyTo(message);
    const context = replyTo ? { replyTo } : {};
    if (message.interactive?.button_reply) {
      return { from: waId, type: "button", listId: message.interactive.button_reply.id, ...context, channel: SessionChannel.WHATSAPP };
    }
    if (message.interactive?.list_reply) {
      return { from: waId, type: "list", listId: message.interactive.list_reply.id, ...context, channel: SessionChannel.WHATSAPP };
    }
  }

  if (sessionState === SessionState.INCIDENCIA_AWAITING_FOTO) {
    if (message.type === WhatsAppMessageType.IMAGE && mediaIds && mediaIds.length > 1) {
      return { from: waId, type: "image", media: await downloadEvidence(mediaIds), channel: SessionChannel.WHATSAPP };
    }
    if (message.type === WhatsAppMessageType.IMAGE && message.image?.id) {
      const download = await downloadWhatsAppMediaAsDataUri(message.image.id);
      const media = download.kind === InboundMediaKind.DATA ? { mediaDataUri: download.dataUri } : { mediaFailure: download.failure };
      return { from: waId, type: "image", text: message.image.caption, ...media, channel: SessionChannel.WHATSAPP };
    }
    if (message.type === "document" && message.document?.id) return { from: waId, type: "document", channel: SessionChannel.WHATSAPP };
  }

  return undefined;
}
