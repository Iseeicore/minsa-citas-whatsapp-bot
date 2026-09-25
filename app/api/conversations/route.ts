import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const conversations = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
  });

  return NextResponse.json(conversations);
}
