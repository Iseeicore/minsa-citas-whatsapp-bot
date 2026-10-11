import { NextRequest, NextResponse } from "next/server";
import { isDatabaseEnabled, persistenceDisabledResponse } from "@/lib/db/persistence";
import { consoleDisabledResponse } from "@/lib/inbox/console-access";
import { ConversationStatus } from "@/lib/enums/conversation-status";
import { toConversationStatus, toMessageDto } from "@/lib/inbox/dto";
import { findLastInbound, findUserState, listMessages } from "@/lib/inbox/repository";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const closed = consoleDisabledResponse();
  if (closed) return closed;

  if (!isDatabaseEnabled()) return persistenceDisabledResponse();

  const { id } = await params;

  const usuario = await findUserState(id);
  const mensajes = await listMessages(id);
  const lastInbound = await findLastInbound(id);

  const windowOpen = Boolean(
    lastInbound && Date.now() - lastInbound.fechaHora.getTime() <= WINDOW_MS,
  );

  const windowExpiresAt = lastInbound
    ? new Date(lastInbound.fechaHora.getTime() + WINDOW_MS).toISOString()
    : null;

  return NextResponse.json({
    messages: mensajes.map(toMessageDto),
    windowOpen,
    windowExpiresAt,
    status: usuario ? toConversationStatus(usuario.estadoConversacionId) : ConversationStatus.OPEN,
  });
}
