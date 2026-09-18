import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MessageDirection } from "@prisma/client";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: { status: true },
  });

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { timestamp: "asc" },
  });

  // Based on the last INBOUND message only, so the UI can show/hide the
  // template-required banner without a second round trip.
  const lastInbound = await prisma.message.findFirst({
    where: { conversationId: id, direction: MessageDirection.INBOUND },
    orderBy: { timestamp: "desc" },
  });

  const windowOpen = Boolean(
    lastInbound && Date.now() - lastInbound.timestamp.getTime() <= WINDOW_MS,
  );

  const windowExpiresAt = lastInbound
    ? new Date(lastInbound.timestamp.getTime() + WINDOW_MS).toISOString()
    : null;

  return NextResponse.json({
    messages,
    windowOpen,
    windowExpiresAt,
    status: conversation?.status ?? "OPEN",
  });
}
