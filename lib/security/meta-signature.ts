import crypto from "crypto";
import { META_SIGNATURE_PREFIX } from "@/lib/constants/meta-signature";

export function metaWebhookSignature(rawBody: string): string {
  return (
    META_SIGNATURE_PREFIX +
    crypto
      .createHmac("sha256", process.env.META_APP_SECRET ?? "")
      .update(rawBody)
      .digest("hex")
  );
}

export function isValidMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;

  const expectedBuffer = Buffer.from(metaWebhookSignature(rawBody));
  const receivedBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
