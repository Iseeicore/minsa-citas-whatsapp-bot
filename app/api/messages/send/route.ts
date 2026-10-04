import { graphApiVersion } from "@/lib/whatsapp/graph-api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ACTOR_OPERADOR_BANDEJA } from "@/lib/db/actor";
import { isDatabaseEnabled, persistenceDisabledResponse } from "@/lib/db/persistence";
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

  const version = graphApiVersion();

  const graphResponse = await fetch(
    `https://graph.facebook.com/${version}/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        recipient: usuario.waId,
        type: "text",
        text: { body: text },
      }),
    },
  );

  const graphBody = await graphResponse.json();

  if (!graphResponse.ok) {
    return NextResponse.json(graphBody, { status: graphResponse.status });
  }

  const waMessageId = graphBody?.messages?.[0]?.id as string | undefined;
  const message = await recordOutboundMessage(usuario.id, text, waMessageId ?? null, ACTOR_OPERADOR_BANDEJA);

  return NextResponse.json(toMessageDto(message), { status: 201 });
}
