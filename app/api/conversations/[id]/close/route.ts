import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isDatabaseEnabled, persistenceDisabledResponse } from "@/lib/db/persistence";
import { ConversationStatus } from "@prisma/client";
import { apiError } from "@/lib/http/api-error";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseEnabled()) return persistenceDisabledResponse();

  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({ where: { id } });

  if (!conversation) {
    return apiError("NOT_FOUND", { message: "No se encontró la conversación." });
  }

  const updated = await prisma.conversation.update({
    where: { id },
    data: { status: ConversationStatus.CLOSED },
  });

  return NextResponse.json(updated);
}
