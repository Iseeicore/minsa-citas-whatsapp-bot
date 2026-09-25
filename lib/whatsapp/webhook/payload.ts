import { MessageStatus, MessageType } from "@prisma/client";
import { downloadWhatsAppMediaAsDataUri } from "@/lib/whatsapp/whatsapp-media";
import type { InboundEvent } from "@/lib/fsm/core/types";

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

export function mapMessageType(type: string): MessageType {
  switch (type) {
    case "text":
      return MessageType.TEXT;
    case "image":
      return MessageType.IMAGE;
    case "audio":
      return MessageType.AUDIO;
    case "document":
      return MessageType.DOCUMENT;
    case "location":
      return MessageType.LOCATION;
    case "template":
      return MessageType.TEMPLATE;
    default:
      return MessageType.UNKNOWN;
  }
}

export function mapStatus(status: string): MessageStatus | null {
  switch (status) {
    case "sent":
      return MessageStatus.SENT;
    case "delivered":
      return MessageStatus.DELIVERED;
    case "read":
      return MessageStatus.READ;
    case "failed":
      return MessageStatus.FAILED;
    default:
      return null;
  }
}

export function extractContentAndMedia(message: WhatsAppMessage): {
  content: string | null;
  mediaUrl: string | null;
} {
  switch (message.type) {
    case "text":
      return { content: message.text?.body ?? null, mediaUrl: null };
    case "image":
      return { content: message.image?.caption ?? null, mediaUrl: message.image?.id ?? null };
    case "audio":
      return { content: null, mediaUrl: message.audio?.id ?? null };
    case "document":
      return {
        content: message.document?.filename ?? null,
        mediaUrl: message.document?.id ?? null,
      };
    case "location":
      return {
        content:
          message.location?.latitude !== undefined && message.location?.longitude !== undefined
            ? `${message.location.latitude},${message.location.longitude}`
            : null,
        mediaUrl: null,
      };
    default:
      return { content: null, mediaUrl: null };
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

  if (message.type === "image" && message.image?.id && sessionState === "reclamo_awaiting_foto") {
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
