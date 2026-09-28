import { prisma } from "@/lib/db/prisma";
import { isDatabaseEnabled } from "@/lib/db/persistence";
import { MessageDirection } from "@prisma/client";
import { withTurnLock } from "@/lib/fsm/session/turn-lock";
import { sessionRowExists } from "@/lib/fsm/session/session-store";
import { screenInbound } from "@/lib/security/perimeter";
import { inboundRateLimiter } from "@/lib/security/rate-limiter";
import {
  type WhatsAppContact,
  type WhatsAppMessage,
  type WhatsAppValue,
  mapMessageType,
  mapStatus,
  extractContentAndMedia,
} from "@/lib/whatsapp/webhook/payload";
import { answerMessage, sendFixedReply, answerFailure } from "@/lib/whatsapp/webhook/answer";
import { inboundDedupe } from "@/lib/whatsapp/webhook/inbound-dedupe";

/** Un solo INSERT decide quién responde: el índice único de waMessageId (P2002) descarta la reentrega concurrente de Meta. */
async function claimInboundMessage(
  message: WhatsAppMessage,
  conversationId: string,
  stored: { content: string | null; mediaUrl: string | null; timestamp: Date },
): Promise<boolean> {
  try {
    await prisma.message.create({
      data: {
        conversationId,
        direction: MessageDirection.INBOUND,
        type: mapMessageType(message.type),
        content: stored.content,
        mediaUrl: stored.mediaUrl,
        waMessageId: message.id,
        timestamp: stored.timestamp,
      },
    });
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return false;
    throw error;
  }
}

async function processInboundMessage(message: WhatsAppMessage, contact: WhatsAppContact | undefined): Promise<void> {
  if (!isDatabaseEnabled()) {
    if (!inboundDedupe.claim(message.id)) return;
    await withTurnLock(message.from_user_id, () => answerMessage(message, null));
    return;
  }

  const profileName = contact?.profile?.name;
  const phoneNumber = message.from ?? contact?.wa_id;
  const timestamp = new Date(Number(message.timestamp) * 1000);
  const { content, mediaUrl } = extractContentAndMedia(message);

  const conversation = await prisma.conversation.upsert({
    where: { waId: message.from_user_id },
    create: {
      waId: message.from_user_id,
      phoneNumber: phoneNumber ?? null,
      profileName: profileName ?? null,
      lastMessageAt: timestamp,
    },
    update: {
      ...(phoneNumber ? { phoneNumber } : {}),
      ...(profileName ? { profileName } : {}),
      lastMessageAt: timestamp,
    },
  });

  if (!(await claimInboundMessage(message, conversation.id, { content, mediaUrl, timestamp }))) return;

  await withTurnLock(message.from_user_id, () => answerMessage(message, conversation.id));
}

export async function processValue(value: WhatsAppValue) {
  const contactsByWaId = new Map<string, WhatsAppContact>();
  for (const contact of value.contacts ?? []) {
    contactsByWaId.set(contact.user_id, contact);
  }

  for (const message of value.messages ?? []) {
    const decision = await screenInbound(
      { waId: message.from_user_id, type: message.type, text: message.text?.body, messageId: message.id },
      { limiter: inboundRateLimiter, hasSession: sessionRowExists },
    );
    if (decision.action === "drop") continue;
    if (decision.action === "reject") {
      await sendFixedReply(message.from_user_id, decision.reply);
      continue;
    }

    try {
      await processInboundMessage(message, contactsByWaId.get(message.from_user_id));
    } catch (error) {
      await answerFailure(message.from_user_id, error);
    }
  }

  if (!isDatabaseEnabled()) return;

  for (const status of value.statuses ?? []) {
    const mappedStatus = mapStatus(status.status);
    if (!mappedStatus) continue;

    await prisma.message.updateMany({
      where: { waMessageId: status.id },
      data: { status: mappedStatus },
    });
  }
}
