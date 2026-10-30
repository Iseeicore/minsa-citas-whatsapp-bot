import crypto from "crypto";
import { findMetaWebhookVerifyToken } from "@/lib/config/integrations";
import { IntegrationVariable } from "@/lib/enums/integration-variable";
import { logger } from "@/lib/observability/logger";

export function isValidMetaVerifyToken(received: string | null, env: Record<string, string | undefined> = process.env): boolean {
  const expected = findMetaWebhookVerifyToken(env);
  if (expected === undefined) {
    logger.error("webhook.verify_token_missing", { variable: IntegrationVariable.META_WEBHOOK_VERIFY_TOKEN });
    return false;
  }
  if (received === null) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
