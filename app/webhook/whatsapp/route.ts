import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { MessageDirection, MessageStatus, MessageType } from "@prisma/client";

// Signature validation needs Node's `crypto` module, not available on Edge.
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && verifyToken === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.META_APP_SECRET ?? "")
      .update(rawBody)
      .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signatureHeader);

  // Buffers must be equal length before a constant-time compare, otherwise
  // `timingSafeEqual` throws.
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

type WhatsAppContact = {
  user_id: string;
  profile?: { name?: string };
};

type WhatsAppMessage = {
  id: string;
  from_user_id: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string };
  audio?: { id?: string };
  document?: { id?: string; filename?: string };
  location?: { latitude?: number; longitude?: number };
};

type WhatsAppStatus = {
  id: string;
  status: string;
};

type WhatsAppValue = {
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
};

type WhatsAppEntry = {
  changes?: { value?: WhatsAppValue }[];
};

type WhatsAppWebhookPayload = {
  entry?: WhatsAppEntry[];
};

function mapMessageType(type: string): MessageType {
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

function mapStatus(status: string): MessageStatus | null {
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

function extractContentAndMedia(message: WhatsAppMessage): {
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

async function processValue(value: WhatsAppValue) {
  const contactsByWaId = new Map<string, WhatsAppContact>();
  for (const contact of value.contacts ?? []) {
    contactsByWaId.set(contact.user_id, contact);
  }

  for (const message of value.messages ?? []) {
    const contact = contactsByWaId.get(message.from_user_id);
    const profileName = contact?.profile?.name;
    const timestamp = new Date(Number(message.timestamp) * 1000);
    const { content, mediaUrl } = extractContentAndMedia(message);

    const conversation = await prisma.conversation.upsert({
      where: { waId: message.from_user_id },
      create: {
        waId: message.from_user_id,
        profileName: profileName ?? null,
        lastMessageAt: timestamp,
      },
      update: {
        ...(profileName ? { profileName } : {}),
        lastMessageAt: timestamp,
      },
    });

    // Meta retries webhook deliveries, so upsert by `waMessageId` keeps
    // duplicate deliveries from creating duplicate rows.
    await prisma.message.upsert({
      where: { waMessageId: message.id },
      create: {
        conversationId: conversation.id,
        direction: MessageDirection.INBOUND,
        type: mapMessageType(message.type),
        content,
        mediaUrl,
        waMessageId: message.id,
        timestamp,
      },
      update: {},
    });
  }

  for (const status of value.statuses ?? []) {
    const mappedStatus = mapStatus(status.status);
    if (!mappedStatus) continue;

    await prisma.message.updateMany({
      where: { waMessageId: status.id },
      data: { status: mappedStatus },
    });
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const signatureHeader = request.headers.get("x-hub-signature-256");
  if (!isValidSignature(rawBody, signatureHeader)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;

  for (const entry of payload.entry ?? []) {
    try {
      for (const change of entry.changes ?? []) {
        if (change.value) {
          await processValue(change.value);
        }
      }
    } catch (error) {
      // Meta expects 200 even on partial failures, or it may disable the
      // webhook after repeated failures. Log and keep processing other entries.
      console.error("Failed to process webhook entry", error);
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
