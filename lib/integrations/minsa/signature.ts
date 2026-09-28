import crypto from "crypto";

export type SignedRequestHeaders = {
  "X-WhatsApp-Timestamp": string;
  "X-WhatsApp-Request-Id": string;
  "X-WhatsApp-Signature": string;
};

export function signMinsaRequest(bodyJson: string): SignedRequestHeaders {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const requestId = crypto.randomUUID();
  const message = `${timestamp}.${requestId}.${bodyJson}`;

  const signature =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.MINSA_INTEGRATION_SECRET ?? "")
      .update(message)
      .digest("hex");

  return {
    "X-WhatsApp-Timestamp": timestamp,
    "X-WhatsApp-Request-Id": requestId,
    "X-WhatsApp-Signature": signature,
  };
}
