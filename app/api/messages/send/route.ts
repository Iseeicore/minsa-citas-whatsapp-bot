import { graphApiVersion } from "@/lib/whatsapp/graph-api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { isDatabaseEnabled, persistenceDisabledResponse } from "@/lib/db/persistence";
import { MessageDirection, MessageStatus, MessageType } from "@prisma/client";
import { apiError } from "@/lib/http/api-error";

const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().min(1),
});

const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  if (!isDatabaseEnabled()) return persistenceDisabledResponse();

  const body = await request.json().catch(() => undefined);
  if (body === undefined) return apiError("INVALID_BODY");
  const parsed = sendMessageSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("INVALID_BODY", { detail: parsed.error.message });
  }

  const { conversationId, text } = parsed.data;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    return apiError("NOT_FOUND", { message: "No se encontró la conversación." });
  }

  const lastInbound = await prisma.message.findFirst({
    where: { conversationId, direction: MessageDirection.INBOUND },
    orderBy: { timestamp: "desc" },
  });

  const windowExpired =
    !lastInbound || Date.now() - lastInbound.timestamp.getTime() > WINDOW_MS;

  if (windowExpired) {
    return apiError("WINDOW_EXPIRED");
  }

  const version = graphApiVersion();

  const graphResponse = await fetch(
    `https://graph.facebook.com/${version}/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        recipient: conversation.waId,
        type: "text",
        text: { body: text },
      }),
    },
  );

  const graphBody = await graphResponse.json();

  if (!graphResponse.ok) {
    return NextResponse.json(graphBody, { status: graphResponse.status });
  }

  const waMessageId = graphBody?.messages?.[0]?.id as string | undefined;
  const now = new Date();

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        content: text,
        waMessageId: waMessageId ?? null,
        status: MessageStatus.SENT,
        timestamp: now,
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: now },
    }),
  ]);

  return NextResponse.json(message, { status: 201 });
}
