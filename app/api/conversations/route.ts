import { NextResponse } from "next/server";
import { isDatabaseEnabled, persistenceDisabledResponse } from "@/lib/db/persistence";
import { toConversationDto } from "@/lib/inbox/dto";
import { listUsers } from "@/lib/inbox/repository";

export async function GET() {
  if (!isDatabaseEnabled()) return persistenceDisabledResponse();

  const usuarios = await listUsers();

  return NextResponse.json(usuarios.map(toConversationDto));
}
