import { EstadoMensajeId } from "@/lib/enums/estado-mensaje-id";
import { TipoMensajeId } from "@/lib/enums/tipo-mensaje-id";
import { downloadWhatsAppMediaAsDataUri } from "@/lib/whatsapp/whatsapp-media";
import type { InboundEvent } from "@/lib/fsm/core/types";
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
  interactive?: {
    button_reply?: { id: string; title?: string };
    list_reply?: { id: string; title?: string };
  };
};

type WhatsAppStatus = {
  id: string;
  status: string;
};

export type WhatsAppValue = {
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
};

type WhatsAppEntry = {
  changes?: { value?: WhatsAppValue }[];
};

export type WhatsAppWebhookPayload = {
  entry?: WhatsAppEntry[];
};

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

export async function toInboundEvent(
  waId: string,
  message: WhatsAppMessage,
  sessionState: string,
): Promise<InboundEvent | null> {
  if (message.type === "text") {
    return { from: waId, type: "text", text: message.text?.body };
  }

  if (message.type === "interactive") {
    if (message.interactive?.button_reply) {
      return { from: waId, type: "button", listId: message.interactive.button_reply.id };
    }
    if (message.interactive?.list_reply) {
      return { from: waId, type: "list", listId: message.interactive.list_reply.id };
    }
  }

  if (message.type === "image" && message.image?.id && sessionState === SessionState.RECLAMO_AWAITING_FOTO) {
    const mediaDataUri = await downloadWhatsAppMediaAsDataUri(message.image.id);
    return {
      from: waId,
      type: "image",
      text: message.image.caption,
      mediaDataUri: mediaDataUri ?? undefined,
    };
  }

  return null;
}
