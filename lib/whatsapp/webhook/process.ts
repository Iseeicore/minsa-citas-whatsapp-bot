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

// True when this delivery is the first of the message and should be answered;
// false when the same WhatsApp message id is already stored (a redelivery).
// Prisma's unique-constraint error is recognized by its code, so any other
// database failure still surfaces instead of being taken for a duplicate.
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

// Stores the inbound message and answers it under the citizen's turn lock.
async function processInboundMessage(message: WhatsAppMessage, contact: WhatsAppContact | undefined): Promise<void> {
  // No database: no conversation row or message history, and this process's
  // memory decides who owns the message (see inbound-dedupe.ts).
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

  // Meta retries webhook deliveries, and a retry can arrive while the first
  // delivery is still being processed. One INSERT decides who owns the
  // message: the unique `waMessageId` index lets exactly one of them in, and
  // the other gets P2002 and is skipped. (A read-then-write pair here would let
  // both pass the read and answer the citizen twice.)
  if (!(await claimInboundMessage(message, conversation.id, { content, mediaUrl, timestamp }))) return;

  // Locked per waId: see answerMessage.
  await withTurnLock(message.from_user_id, () => answerMessage(message, conversation.id));
}

export async function processValue(value: WhatsAppValue) {
  const contactsByWaId = new Map<string, WhatsAppContact>();
  for (const contact of value.contacts ?? []) {
    contactsByWaId.set(contact.user_id, contact);
  }

  for (const message of value.messages ?? []) {
    // Perimeter first — before any database write, transaction or turn lock:
    // flooding is dropped silently (Meta already got its 200), and a first
    // message that is too long, carries links, or is unsolicited media gets a
    // fixed text reply and is never stored. See lib/security/perimeter.ts.
    const decision = await screenInbound(
      { waId: message.from_user_id, type: message.type, text: message.text?.body, messageId: message.id },
      { limiter: inboundRateLimiter, hasSession: sessionRowExists },
    );
    if (decision.action === "drop") continue;
    if (decision.action === "reject") {
      await sendFixedReply(message.from_user_id, decision.reply);
      continue;
    }

    // From here on ANY failure (storing the conversation, the lock, the turn, its
    // replies) is answered with a friendly text instead of leaving the citizen in
    // silence: Meta already got its 200, so nobody else will ever tell them.
    try {
      await processInboundMessage(message, contactsByWaId.get(message.from_user_id));
    } catch (error) {
      await answerFailure(message.from_user_id, error);
    }
  }

  // Delivery statuses only update the message history, which does not exist
  // without a database.
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
