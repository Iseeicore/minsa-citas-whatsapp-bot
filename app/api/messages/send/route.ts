import { graphMessagesPath } from "@/lib/whatsapp/graph-api";
import { graphClient } from "@/lib/whatsapp/graph-client";
import { toGraphTextMessage } from "@/lib/utils/graph-text-message";
import { GraphResultStatus } from "@/lib/enums/graph-result-status";
import type { GraphSendMessageResponse } from "@/lib/types/graph-api.types";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ACTOR_OPERADOR_BANDEJA } from "@/lib/db/actor";
import { isDatabaseEnabled, persistenceDisabledResponse } from "@/lib/db/persistence";
import { consoleDisabledResponse } from "@/lib/inbox/console-access";
import { toMessageDto } from "@/lib/inbox/dto";
import { findLastInbound, findUser, recordOutboundMessage } from "@/lib/inbox/repository";
import { apiError } from "@/lib/http/api-error";
import { ApiErrorCode } from "@/lib/enums/api-error-code";

const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().min(1),
});

const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const closed = consoleDisabledResponse();
  if (closed) return closed;

  if (!isDatabaseEnabled()) return persistenceDisabledResponse();

  const body = await request.json().catch(() => undefined);
  if (body === undefined) return apiError(ApiErrorCode.INVALID_BODY);
  const parsed = sendMessageSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(ApiErrorCode.INVALID_BODY, { detail: parsed.error.message });
  }

  const { conversationId, text } = parsed.data;

  const usuario = await findUser(conversationId);

  if (!usuario) {
    return apiError(ApiErrorCode.NOT_FOUND, { message: "No se encontró la conversación." });
  }

  const lastInbound = await findLastInbound(conversationId);

  const windowExpired =
    !lastInbound || Date.now() - lastInbound.fechaHora.getTime() > WINDOW_MS;

  if (windowExpired) {
    return apiError(ApiErrorCode.WINDOW_EXPIRED);
  }

  const graph = await graphClient.post<GraphSendMessageResponse>(graphMessagesPath(), toGraphTextMessage(usuario.waId, text));

  if (graph.status === GraphResultStatus.ERROR) {
    return NextResponse.json(graph.error, { status: graph.httpStatus });
  }

  const waMessageId = graph.data.messages?.[0]?.id ?? null;
  const message = await recordOutboundMessage(usuario.id, text, waMessageId, ACTOR_OPERADOR_BANDEJA);

  return NextResponse.json(toMessageDto(message), { status: 201 });
}
