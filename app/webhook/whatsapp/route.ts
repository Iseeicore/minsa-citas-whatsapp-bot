import { NextRequest, NextResponse, after } from "next/server";
import type { WhatsAppWebhookPayload } from "@/lib/whatsapp/webhook/payload";
import { processValue } from "@/lib/whatsapp/webhook/process";
import { logger } from "@/lib/observability/logger";
import { apiError } from "@/lib/http/api-error";
import { ApiErrorCode } from "@/lib/enums/api-error-code";
import { parseJsonOr } from "@/lib/utils/safe-json";
import { isValidMetaSignature } from "@/lib/security/meta-signature";
import { META_SIGNATURE_HEADER } from "@/lib/constants/meta-signature";

export const runtime = "nodejs";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && verifyToken === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!isValidMetaSignature(rawBody, request.headers.get(META_SIGNATURE_HEADER))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const parsed = parseJsonOr(rawBody, undefined);
  if (parsed === undefined) return apiError(ApiErrorCode.INVALID_BODY);
  const payload = parsed as WhatsAppWebhookPayload;

  after(async () => {
    for (const entry of payload.entry ?? []) {
      try {
        for (const change of entry.changes ?? []) {
          if (change.value) {
            await processValue(change.value);
          }
        }
      } catch (error) {
        logger.error("webhook.entry_failed", { error });
      }
    }
  });

  return NextResponse.json({ received: true }, { status: 200 });
}
