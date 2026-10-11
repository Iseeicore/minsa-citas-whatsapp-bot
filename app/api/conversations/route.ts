import { NextResponse } from "next/server";
import { isDatabaseEnabled, persistenceDisabledResponse } from "@/lib/db/persistence";
import { consoleDisabledResponse } from "@/lib/inbox/console-access";
import { toConversationDto } from "@/lib/inbox/dto";
import { listUsers } from "@/lib/inbox/repository";

export async function GET() {
  const closed = consoleDisabledResponse();
  if (closed) return closed;

  if (!isDatabaseEnabled()) return persistenceDisabledResponse();

  const usuarios = await listUsers();

  return NextResponse.json(usuarios.map(toConversationDto));
}
