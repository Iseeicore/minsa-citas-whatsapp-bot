import { NextRequest, NextResponse, after } from "next/server";
import crypto from "crypto";
import type { WhatsAppWebhookPayload } from "@/lib/whatsapp/webhook/payload";
import { processValue } from "@/lib/whatsapp/webhook/process";

// Signature validation needs Node's `crypto` module, not available on Edge.
export const runtime = "nodejs";

// A turn can now chain several real API calls (auto-selected catalog steps,
// the Gemini district fallback, typing-indicator sleeps) — set explicitly
// so this never depends on the platform's implicit default.
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

  // Buffers must be equal length before a constant-time compare, otherwise
  // `timingSafeEqual` throws.
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const signatureHeader = request.headers.get("x-hub-signature-256");
  if (!isValidSignature(rawBody, signatureHeader)) {
    // Not signed by Meta: refused before anything is read, stored or answered.
    return new NextResponse("Forbidden", { status: 403 });
  }

  const payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;

  // Meta expects an HTTP response within a few seconds or it considers the
  // delivery failed and retries the identical payload later (with
  // exponential backoff, for up to 7 days) — a full FSM turn (typing
  // indicators, MINSA/RENIEC/Gemini calls) routinely takes longer than that.
  // `after()` lets us acknowledge Meta immediately while the real
  // processing keeps running in the background of this same invocation
  // (bounded by maxDuration above), instead of a queue/worker we've
  // deliberately avoided elsewhere in this project.
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
