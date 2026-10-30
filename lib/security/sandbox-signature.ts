import crypto from "crypto";
import { SANDBOX_SIGNATURE_PREFIX } from "@/lib/constants/sandbox-signature";
import { SANDBOX_SIGNATURE_TOLERANCE_SECONDS } from "@/lib/constants/limits/sandbox";
import { SandboxSignatureResult } from "@/lib/enums/sandbox-signature-result";

export function signSandboxBody(secret: string, timestamp: string, body: string): string {
  return SANDBOX_SIGNATURE_PREFIX + crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifySandboxSignature(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowSeconds: number;
}): SandboxSignatureResult {
  const { secret, timestamp, signature, body, nowSeconds } = input;
  if (!timestamp || !signature) return SandboxSignatureResult.MISSING;

  const issuedAt = Number(timestamp);
  if (!Number.isInteger(issuedAt)) return SandboxSignatureResult.INVALID;
  if (Math.abs(nowSeconds - issuedAt) > SANDBOX_SIGNATURE_TOLERANCE_SECONDS) return SandboxSignatureResult.EXPIRED;

  const expected = Buffer.from(signSandboxBody(secret, timestamp, body));
  const received = Buffer.from(signature);
  if (expected.length !== received.length) return SandboxSignatureResult.INVALID;

  return crypto.timingSafeEqual(expected, received) ? SandboxSignatureResult.VALID : SandboxSignatureResult.INVALID;
}
