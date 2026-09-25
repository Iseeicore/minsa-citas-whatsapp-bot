import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ConversationStatus } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({ where: { id } });

  if (!conversation) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Conversation not found." },
      { status: 404 },
    );
  }

  const updated = await prisma.conversation.update({
    where: { id },
    data: { status: ConversationStatus.CLOSED },
  });

  return NextResponse.json(updated);
}
