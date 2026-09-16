import { describe, expect, it } from "vitest";
import { signMinsaRequest } from "./minsa-request-signature.js";

// D26: the ENTIRE MINSA HMAC uncertainty lives in this one pure function.
// These are fixed-vector tests (D21 discipline applied to crypto) — a known
// secret/timestamp/requestId/body produces a known hex digest, computed
// independently with node's own crypto.createHmac and pinned here so a
// future edit to the signing formula fails loudly instead of silently.
const SECRET = "test-integration-secret";
const TIMESTAMP = "1700000000000";
const REQUEST_ID = "11111111-1111-1111-1111-111111111111";
const BODY_JSON = '{"dni":"12345678"}';
const EXPECTED_SIGNATURE =
  "sha256=fe01e9c14c16b27c7e3a4d337575bb7632f008abf92ce71f20df6934d962820a";

describe("signMinsaRequest", () => {
  it("produces the known fixed-vector signature for a known input", () => {
    const result = signMinsaRequest({
      secret: SECRET,
      timestamp: TIMESTAMP,
      requestId: REQUEST_ID,
      bodyJson: BODY_JSON,
    });

    expect(result.signature).toBe(EXPECTED_SIGNATURE);
  });

  it("echoes the timestamp and requestId it was given, unchanged", () => {
    const result = signMinsaRequest({
      secret: SECRET,
      timestamp: TIMESTAMP,
      requestId: REQUEST_ID,
      bodyJson: BODY_JSON,
    });

    expect(result.timestamp).toBe(TIMESTAMP);
    expect(result.requestId).toBe(REQUEST_ID);
  });

  it("flips the digest entirely when a single byte in the body changes", () => {
    const original = signMinsaRequest({
      secret: SECRET,
      timestamp: TIMESTAMP,
      requestId: REQUEST_ID,
      bodyJson: BODY_JSON,
    });
    const oneByteChanged = signMinsaRequest({
      secret: SECRET,
      timestamp: TIMESTAMP,
      requestId: REQUEST_ID,
      bodyJson: '{"dni":"12345679"}',
    });

    expect(oneByteChanged.signature).not.toBe(original.signature);
  });

  it("is deterministic for identical inputs", () => {
    const resultA = signMinsaRequest({
      secret: SECRET,
      timestamp: TIMESTAMP,
      requestId: REQUEST_ID,
      bodyJson: BODY_JSON,
    });
    const resultB = signMinsaRequest({
      secret: SECRET,
      timestamp: TIMESTAMP,
      requestId: REQUEST_ID,
      bodyJson: BODY_JSON,
    });

    expect(resultB.signature).toBe(resultA.signature);
  });
});
