import { PrismaClient, Prisma } from "@prisma/client";
import type pino from "pino";
import type {
  ConversationRepository,
  ConversationSummary,
  InboundMessageRecord,
  MessageStatus,
  MessageSummary,
  OutboundMessageRecord,
} from "../ports/conversation-repository.js";

export interface PrismaConversationRepositoryDeps {
  config: { postgresUrl: string };
  logger: pino.Logger;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// Same discipline as redactRedisUrl (redis-conversation-event-dao.ts) — a
// Neon connection string carries an embedded password; never let it reach a
// log sink. Keeps protocol+host+path, drops query string (which can also
// carry credentials/pooling flags) and any userinfo.
export function redactPostgresUrl(postgresUrl: string): string {
  try {
    const url = new URL(postgresUrl);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "[postgres url unparsable]";
  }
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}

// Synchronous constructor, no I/O at construction time — same discipline as
// every Redis adapter in this codebase (PrismaClient itself connects lazily
// on first query, so this already holds without any extra effort).
export function createPrismaConversationRepository(deps: PrismaConversationRepositoryDeps): ConversationRepository {
  const { config, logger } = deps;

  const prisma = new PrismaClient({
    datasources: { db: { url: config.postgresUrl } },
  });

  logger.info(
    { postgresUrl: redactPostgresUrl(config.postgresUrl) },
    "[conversation-repository:prisma] Cliente inicializado"
  );

  async function findOrCreateConversation(waId: string, displayName: string | undefined) {
    return prisma.conversation.upsert({
      where: { waId },
      update: displayName !== undefined ? { displayName } : {},
      create: { waId, displayName },
    });
  }

  return {
    async recordInboundMessage(input: InboundMessageRecord) {
      const conversation = await findOrCreateConversation(input.waId, input.contactName);

      try {
        // Array form of $transaction: atomic — if the message insert
        // conflicts (P2002, a Meta-redelivered wamid we already have), the
        // conversation's lastMessageAt/lastInboundAt bump rolls back with
        // it, so a duplicate delivery never double-counts activity either.
        await prisma.$transaction([
          prisma.message.create({
            data: {
              conversationId: conversation.id,
              direction: "INBOUND",
              type: input.type,
              text: input.text,
              mediaId: input.mediaId,
              mediaMimeType: input.mediaMimeType,
              latitude: input.latitude,
              longitude: input.longitude,
              waMessageId: input.waMessageId,
              timestamp: input.timestamp,
            },
          }),
          prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: input.timestamp, lastInboundAt: input.timestamp },
          }),
        ]);
      } catch (err) {
        if (isUniqueConstraintViolation(err)) return;
        throw err;
      }
    },

    async recordOutboundMessage(input: OutboundMessageRecord) {
      const conversation = await findOrCreateConversation(input.waId, undefined);
      const message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: "OUTBOUND",
          type: "TEXT",
          text: input.text,
          waMessageId: input.waMessageId,
          timestamp: input.timestamp,
        },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: input.timestamp },
      });
      return { conversationId: conversation.id, messageId: message.id };
    },

    async updateMessageStatusByWaMessageId(waMessageId: string, status: MessageStatus) {
      try {
        await prisma.message.update({ where: { waMessageId }, data: { status } });
      } catch (err) {
        // No message on record with that wamid (e.g. sent before this
        // feature existed) — nothing to update, not an error.
        if (isRecordNotFound(err)) return;
        throw err;
      }
    },

    async isWithin24HourWindow(waId: string) {
      const conversation = await prisma.conversation.findUnique({ where: { waId } });
      if (conversation === null) return false;
      return Date.now() - conversation.lastInboundAt.getTime() < TWENTY_FOUR_HOURS_MS;
    },

    async listConversations(): Promise<readonly ConversationSummary[]> {
      const conversations = await prisma.conversation.findMany({ orderBy: { lastMessageAt: "desc" } });
      return conversations.map((c) => ({
        id: c.id,
        waId: c.waId,
        displayName: c.displayName ?? undefined,
        lastMessageAt: c.lastMessageAt,
      }));
    },

    async listMessages(conversationId: string): Promise<readonly MessageSummary[]> {
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { timestamp: "asc" },
      });
      return messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        type: m.type,
        text: m.text ?? undefined,
        mediaId: m.mediaId ?? undefined,
        mediaMimeType: m.mediaMimeType ?? undefined,
        latitude: m.latitude ?? undefined,
        longitude: m.longitude ?? undefined,
        status: m.status,
        timestamp: m.timestamp,
      }));
    },

    async close() {
      await prisma.$disconnect();
    },
  };
}
