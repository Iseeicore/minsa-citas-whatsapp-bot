import { graphAuthHeaders, graphMessagesUrl } from "@/lib/whatsapp/graph-api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ACTOR_OPERADOR_BANDEJA } from "@/lib/db/actor";
import { isDatabaseEnabled, persistenceDisabledResponse } from "@/lib/db/persistence";
import { consoleDisabledResponse } from "@/lib/inbox/console-access";
import { toMessageDto } from "@/lib/inbox/dto";
import { findLastInbound, findUser, recordOutboundMessage } from "@/lib/inbox/repository";
import { apiError } from "@/lib/http/api-error";
import { ApiErrorCode } from "@/lib/enums/api-error-code";
import { logger } from "@/lib/observability/logger";
import { parseJsonOr } from "@/lib/utils/safe-json";
import { graphFailureErrorCode, type GraphSendBody } from "@/lib/inbox/graph-failure";

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

  let graphResponse: Response;
  try {
    graphResponse = await fetch(graphMessagesUrl(), {
      method: "POST",
      headers: { ...graphAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        recipient: usuario.waId,
        type: "text",
        text: { body: text },
      }),
    });
  } catch (error) {
    logger.error("inbox.send_failed", { conversationId, reason: "request_failed", error });
    return apiError(ApiErrorCode.WHATSAPP_UNAVAILABLE);
  }

  const graphBody = parseJsonOr(await graphResponse.text(), undefined) as GraphSendBody | undefined;

  if (!graphResponse.ok) {
    const errorCode = graphFailureErrorCode(graphResponse.status);
    logger.error("inbox.send_failed", {
      conversationId,
      reason: "graph_error",
      status: graphResponse.status,
      metaErrorCode: graphBody?.error?.code,
    });
    return apiError(errorCode);
  }

  const waMessageId = graphBody?.messages?.[0]?.id;
  const message = await recordOutboundMessage(usuario.id, text, waMessageId ?? null, ACTOR_OPERADOR_BANDEJA);

  return NextResponse.json(toMessageDto(message), { status: 201 });
}
