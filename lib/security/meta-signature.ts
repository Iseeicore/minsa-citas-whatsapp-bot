import crypto from "crypto";
import { META_SIGNATURE_PREFIX } from "@/lib/constants/meta-signature";
import { findMetaAppSecret } from "@/lib/config/integrations";
import { logger } from "@/lib/observability/logger";

export function metaWebhookSignature(rawBody: string, secret: string): string {
  return META_SIGNATURE_PREFIX + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function isValidMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = findMetaAppSecret();
  if (secret === undefined) {
    logger.error("webhook.signature_secret_missing");
    return false;
  }
  if (!signatureHeader) return false;

  const expectedBuffer = Buffer.from(metaWebhookSignature(rawBody, secret));
  const receivedBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
