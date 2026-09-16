import { describe, expect, it } from "vitest";
import { msisdnDigest, msisdnFingerprint } from "./msisdn-fingerprint.js";

const SECRET = "test-session-key-secret";
const MSISDN = "51999999999";

// D17/D18: msisdnDigest is the full 64-hex lookup key; msisdnFingerprint is
// the 12-hex truncation used for log correlation only. This is the
// regression lock proving the inbound-conversation-event-log-view
// extraction changed no observable output.
describe("msisdnDigest", () => {
  it("returns a 64-character hex string", () => {
    const digest = msisdnDigest(MSISDN, SECRET);

    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same (msisdn, secret) pair", () => {
    const digestA = msisdnDigest(MSISDN, SECRET);
    const digestB = msisdnDigest(MSISDN, SECRET);

    expect(digestA).toBe(digestB);
  });

  it("differs for a different MSISDN with the same secret", () => {
    const digestA = msisdnDigest("51999999999", SECRET);
    const digestB = msisdnDigest("51988888888", SECRET);

    expect(digestA).not.toBe(digestB);
  });

  it("differs for the same MSISDN with a different secret", () => {
    const digestA = msisdnDigest(MSISDN, "secret-one");
    const digestB = msisdnDigest(MSISDN, "secret-two");

    expect(digestA).not.toBe(digestB);
  });
});

describe("msisdnFingerprint", () => {
  it("returns the first 12 hex characters of msisdnDigest", () => {
    const digest = msisdnDigest(MSISDN, SECRET);
    const fingerprint = msisdnFingerprint(MSISDN, SECRET);

    expect(fingerprint).toBe(digest.slice(0, 12));
    expect(fingerprint).toHaveLength(12);
  });

  it("differs for a different MSISDN with the same secret", () => {
    const fingerprintA = msisdnFingerprint("51999999999", SECRET);
    const fingerprintB = msisdnFingerprint("51988888888", SECRET);

    expect(fingerprintA).not.toBe(fingerprintB);
  });
});
