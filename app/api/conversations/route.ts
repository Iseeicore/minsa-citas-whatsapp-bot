import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isDatabaseEnabled, persistenceDisabledResponse } from "@/lib/db/persistence";

export async function GET() {
  if (!isDatabaseEnabled()) return persistenceDisabledResponse();

  const conversations = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
  });

  return NextResponse.json(conversations);
}
