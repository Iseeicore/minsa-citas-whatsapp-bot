import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { MessageDirection, MessageStatus, MessageType } from "@prisma/client";

const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().min(1),
});

const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = sendMessageSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: parsed.error.message },
      { status: 400 },
    );
  }

  const { conversationId, text } = parsed.data;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Conversation not found." },
      { status: 404 },
    );
  }

  // The 24h customer-service window is based on the last INBOUND message,
  // not overall conversation activity — this is a WhatsApp business rule.
  const lastInbound = await prisma.message.findFirst({
    where: { conversationId, direction: MessageDirection.INBOUND },
    orderBy: { timestamp: "desc" },
  });

  const windowExpired =
    !lastInbound || Date.now() - lastInbound.timestamp.getTime() > WINDOW_MS;

  if (windowExpired) {
    return NextResponse.json(
      {
        error: "WINDOW_EXPIRED",
        message:
          "The 24-hour customer service window is closed. Send an approved template message instead.",
      },
      { status: 422 },
    );
  }

  const graphResponse = await fetch(
    `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: conversation.waId,
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
