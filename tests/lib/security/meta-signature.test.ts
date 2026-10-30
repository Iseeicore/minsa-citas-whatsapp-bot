import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidMetaSignature, metaWebhookSignature } from "@/lib/security/meta-signature";
import { captureLogs } from "@/tests/support/capture-logs";

const SECRET = "app-secret";
const BODY = '{"entry":[]}';
const expected = (secret: string, body: string) => "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("metaWebhookSignature", () => {
  it("signs the raw body exactly like Meta, with the given secret", () => {
    expect(metaWebhookSignature(BODY, SECRET)).toBe(expected(SECRET, BODY));
  });
});

describe("isValidMetaSignature", () => {
  it("accepts the signature computed with the same secret", () => {
    vi.stubEnv("META_APP_SECRET", SECRET);

    expect(isValidMetaSignature(BODY, expected(SECRET, BODY))).toBe(true);
  });

  it.each([
    ["missing", null],
    ["signed with another secret", expected("other", BODY)],
    ["of another length", "sha256=abc"],
  ])("rejects a signature that is %s", (_case, header) => {
    vi.stubEnv("META_APP_SECRET", SECRET);

    expect(isValidMetaSignature(BODY, header)).toBe(false);
  });

  it.each([
    ["not defined", undefined],
    ["empty", ""],
    ["blank", "   "],
  ])("rejects even a signature made with an empty key when META_APP_SECRET is %s, and logs it", (_case, secret) => {
    vi.stubEnv("META_APP_SECRET", secret);
    const lines = captureLogs();

    expect(isValidMetaSignature(BODY, expected("", BODY))).toBe(false);
    expect(lines).toContainEqual(expect.objectContaining({ level: "error", event: "webhook.signature_secret_missing" }));
  });
});
