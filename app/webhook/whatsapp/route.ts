import { NextRequest, NextResponse, after } from "next/server";
import crypto from "crypto";
import type { WhatsAppWebhookPayload } from "@/lib/whatsapp/webhook/payload";
import { processValue } from "@/lib/whatsapp/webhook/process";

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

/** Valida la firma HMAC-SHA256 de Meta (x-hub-signature-256) con comparación de tiempo constante. */
function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.META_APP_SECRET ?? "")
      .update(rawBody)
      .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

/** Responde 200 a Meta de inmediato y procesa en segundo plano (after): una respuesta lenta hace que Meta reintente el mismo mensaje. */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const signatureHeader = request.headers.get("x-hub-signature-256");
  if (!isValidSignature(rawBody, signatureHeader)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;

  after(async () => {
    for (const entry of payload.entry ?? []) {
      try {
        for (const change of entry.changes ?? []) {
          if (change.value) {
            await processValue(change.value);
          }
        }
      } catch (error) {
        console.error("Failed to process webhook entry", error);
      }
    }
  });

  return NextResponse.json({ received: true }, { status: 200 });
}
