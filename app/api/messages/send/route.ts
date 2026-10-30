import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isDatabaseEnabled, persistenceDisabledResponse } from "@/lib/db/persistence";
import { consoleDisabledResponse } from "@/lib/inbox/console-access";
import { toMessageDto } from "@/lib/inbox/dto";
import { findLastInbound, findUser } from "@/lib/inbox/repository";
import { apiError } from "@/lib/http/api-error";
import { ApiErrorCode } from "@/lib/enums/api-error-code";
import { CONVERSACION_NO_ENCONTRADA_TEXT } from "@/lib/constants/textos/bandeja";
import { sendOperatorMessage } from "@/lib/whatsapp/operator-send";
import { OperatorSendStatus } from "@/lib/enums/operator-send-status";

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
    return apiError(ApiErrorCode.NOT_FOUND, { message: CONVERSACION_NO_ENCONTRADA_TEXT });
  }

  const lastInbound = await findLastInbound(conversationId);

  const windowExpired =
    !lastInbound || Date.now() - lastInbound.fechaHora.getTime() > WINDOW_MS;

  if (windowExpired) {
    return apiError(ApiErrorCode.WINDOW_EXPIRED);
  }

  const result = await sendOperatorMessage(usuario, text);
  if (result.status === OperatorSendStatus.FAILED) return apiError(result.errorCode);

  return NextResponse.json(toMessageDto(result.message), { status: 201 });
}
