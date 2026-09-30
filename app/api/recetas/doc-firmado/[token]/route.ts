import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/http/api-error";
import { ApiErrorCode } from "@/lib/enums/api-error-code";
import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";
import { sendTemplateMessage } from "@/lib/whatsapp/whatsapp-send";

const docFirmadoSchema = z.object({
  uuid: z.string().min(1),
  celular: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const secret = process.env.RECETA_CALLBACK_SECRET;

  if (!secret || token !== secret) {
    return apiError(ApiErrorCode.NOT_FOUND);
  }

  const body = await request.json().catch(() => undefined);
  if (body === undefined) return apiError(ApiErrorCode.INVALID_BODY);
  const parsed = docFirmadoSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(ApiErrorCode.INVALID_BODY, { detail: parsed.error.message });
  }

  const { uuid, celular } = parsed.data;

  try {
    const response = await sendTemplateMessage(celular, {
      templateName: process.env.RECETA_TEMPLATE_NAME ?? "",
      languageCode: process.env.RECETA_TEMPLATE_LANGUAGE ?? "es",
      bodyParams: [uuid],
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      logger.error("recetas.template_send_failed", { celular: tail(celular), status: response.status, response: responseBody });
      return apiError(ApiErrorCode.TEMPLATE_SEND_FAILED);
    }
  } catch (error) {
    logger.error("recetas.template_send_failed", { celular: tail(celular), error });
    return apiError(ApiErrorCode.TEMPLATE_SEND_FAILED);
  }

  return NextResponse.json({ ok: true });
}
