import crypto from "node:crypto";

// D26: the ENTIRE MINSA HMAC uncertainty lives in this one pure function.
// The HMAC shape (header names, message format, digest encoding) is
// unvalidated against the live endpoint — a proposal-flagged risk. Isolating
// it behind one deterministic function of explicit inputs (never generating
// its own timestamp/requestId/clock) means the fixed-vector test in
// minsa-request-signature.test.ts proves the whole risk with zero doubles
// and zero clock — the D21 discipline (isolate the unknown in one file)
// applied to crypto.
//
// The caller (the adapter, not this function) owns generating `timestamp`
// and `requestId` and MUST serialize the request body exactly once — the
// same `bodyJson` string passed here MUST be the exact string sent over the
// wire. Re-serializing for the HTTP request is the classic HMAC defect
// (key order / whitespace divergence) and is explicitly forbidden by design.
export interface SignMinsaRequestInput {
  readonly secret: string;
  readonly timestamp: string;
  readonly requestId: string;
  readonly bodyJson: string;
}

export interface SignMinsaRequestResult {
  readonly timestamp: string;
  readonly requestId: string;
  readonly signature: string;
}

/**
 * Computes the MINSA identity-endpoint request signature:
 * `sha256=` + HMAC-SHA256(secret, `${timestamp}.${requestId}.${bodyJson}`) hex digest.
 *
 * Pure and deterministic — given the same inputs, always returns the same
 * output. Echoes `timestamp`/`requestId` back unchanged so a caller can build
 * all three MINSA headers (`X-WhatsApp-Timestamp`, `X-WhatsApp-Request-Id`,
 * `X-WhatsApp-Signature`) from a single result.
 */
export function signMinsaRequest(
  input: SignMinsaRequestInput,
): SignMinsaRequestResult {
  const { secret, timestamp, requestId, bodyJson } = input;
  const message = `${timestamp}.${requestId}.${bodyJson}`;
  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");

  return {
    timestamp,
    requestId,
    signature: `sha256=${digest}`,
  };
}
