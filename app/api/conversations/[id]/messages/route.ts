import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isDatabaseEnabled, persistenceDisabledResponse } from "@/lib/db/persistence";
import { MessageDirection } from "@prisma/client";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // The inbox is the message history: without a database there is none.
  if (!isDatabaseEnabled()) return persistenceDisabledResponse();

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
