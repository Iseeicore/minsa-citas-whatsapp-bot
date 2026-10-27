import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidMetaSignature, metaWebhookSignature } from "@/lib/security/meta-signature";

const SECRET = "app-secret";
const BODY = '{"entry":[]}';
const expected = (secret: string, body: string) => "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("metaWebhookSignature", () => {
  it("signs the raw body exactly like Meta, with META_APP_SECRET", () => {
    vi.stubEnv("META_APP_SECRET", SECRET);

    expect(metaWebhookSignature(BODY)).toBe(expected(SECRET, BODY));
  });

  it("signs with an empty key when META_APP_SECRET is not defined, as the webhook verifies today", () => {
    vi.stubEnv("META_APP_SECRET", undefined);

    expect(metaWebhookSignature(BODY)).toBe(expected("", BODY));
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
});
