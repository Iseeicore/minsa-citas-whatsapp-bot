import crypto from "crypto";
import { findMinsaIntegrationSecret } from "@/lib/config/integrations";
import { MinsaSignatureStatus } from "@/lib/enums/minsa-signature-status";
import { toUnixSeconds } from "@/lib/time/epoch-seconds";

export type SignedRequestHeaders = {
  "X-WhatsApp-Timestamp": string;
  "X-WhatsApp-Request-Id": string;
  "X-WhatsApp-Signature": string;
};

export type MinsaSignature =
  { status: MinsaSignatureStatus.SIGNED; headers: SignedRequestHeaders } | { status: MinsaSignatureStatus.SECRET_MISSING };

export function signMinsaRequest(bodyJson: string): MinsaSignature {
  const secret = findMinsaIntegrationSecret();
  if (secret === undefined) return { status: MinsaSignatureStatus.SECRET_MISSING };

  const timestamp = toUnixSeconds(Date.now()).toString();
  const requestId = crypto.randomUUID();
  const message = `${timestamp}.${requestId}.${bodyJson}`;

  const signature = "sha256=" + crypto.createHmac("sha256", secret).update(message).digest("hex");

  return {
    status: MinsaSignatureStatus.SIGNED,
    headers: {
      "X-WhatsApp-Timestamp": timestamp,
      "X-WhatsApp-Request-Id": requestId,
      "X-WhatsApp-Signature": signature,
    },
  };
}
