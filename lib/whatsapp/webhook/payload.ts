import { EstadoMensajeId } from "@/lib/enums/estado-mensaje-id";
import { TipoMensajeId } from "@/lib/enums/tipo-mensaje-id";
import { downloadWhatsAppMediaAsDataUri } from "@/lib/whatsapp/whatsapp-media";
import type { InboundEvent, InboundMedia } from "@/lib/fsm/core/types";
import { MAX_IMAGENES_POR_INCIDENCIA } from "@/lib/constants/limits/incidencia";
import { MediaFailure } from "@/lib/enums/media-failure";
import { InboundMediaKind } from "@/lib/enums/inbound-media-kind";
import { WhatsAppMessageType } from "@/lib/enums/whatsapp-message-type";
import { SessionState } from "@/lib/enums/session-state";

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

export function mapStatus(status: string): EstadoMensajeId | null {
  switch (status) {
    case "sent":
      return EstadoMensajeId.ENVIADO;
    case "delivered":
      return EstadoMensajeId.ENTREGADO;
    case "read":
      return EstadoMensajeId.LEIDO;
    case "failed":
      return EstadoMensajeId.FALLIDO;
    default:
      return null;
  }
}

export function extractContentAndMedia(message: WhatsAppMessage): {
  content: string | null;
  mediaId: string | null;
} {
  switch (message.type) {
    case "text":
      return { content: message.text?.body ?? null, mediaId: null };
    case "image":
      return { content: message.image?.caption ?? null, mediaId: message.image?.id ?? null };
    case "audio":
      return { content: null, mediaId: message.audio?.id ?? null };
    case "document":
      return {
        content: message.document?.filename ?? null,
        mediaId: message.document?.id ?? null,
      };
    case "location":
      return {
        content:
          message.location?.latitude !== undefined && message.location?.longitude !== undefined
            ? `${message.location.latitude},${message.location.longitude}`
            : null,
        mediaId: null,
      };
    default:
      return { content: null, mediaId: null };
  }
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
): Promise<InboundEvent | null> {
  if (message.type === "text") {
    return { from: waId, type: "text", text: message.text?.body };
  }

  if (message.type === "interactive") {
    const replyTo = tapReplyTo(message);
    const context = replyTo ? { replyTo } : {};
    if (message.interactive?.button_reply) {
      return { from: waId, type: "button", listId: message.interactive.button_reply.id, ...context };
    }
    if (message.interactive?.list_reply) {
      return { from: waId, type: "list", listId: message.interactive.list_reply.id, ...context };
    }
  }

  if (sessionState === SessionState.INCIDENCIA_AWAITING_FOTO) {
    if (message.type === WhatsAppMessageType.IMAGE && mediaIds && mediaIds.length > 1) {
      return { from: waId, type: "image", media: await downloadEvidence(mediaIds) };
    }
    if (message.type === WhatsAppMessageType.IMAGE && message.image?.id) {
      const download = await downloadWhatsAppMediaAsDataUri(message.image.id);
      const media = download.kind === InboundMediaKind.DATA ? { mediaDataUri: download.dataUri } : { mediaFailure: download.failure };
      return { from: waId, type: "image", text: message.image.caption, ...media };
    }
    if (message.type === "document" && message.document?.id) return { from: waId, type: "document" };
  }

  return null;
}
