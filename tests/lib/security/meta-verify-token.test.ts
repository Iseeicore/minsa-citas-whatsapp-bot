import { describe, expect, it } from "vitest";
import { isValidMetaVerifyToken } from "@/lib/security/meta-verify-token";
import { captureLogs } from "@/tests/support/capture-logs";

const TOKEN = "verify-token-de-prueba";

describe("isValidMetaVerifyToken", () => {
  it("accepts the configured token", () => {
    expect(isValidMetaVerifyToken(TOKEN, { META_WEBHOOK_VERIFY_TOKEN: TOKEN })).toBe(true);
  });

  it.each([
    ["a different token of the same length", "X".repeat(TOKEN.length)],
    ["a longer token", `${TOKEN}x`],
    ["a shorter token", TOKEN.slice(1)],
    ["no token", null],
  ])("rejects %s", (_label, received) => {
    expect(isValidMetaVerifyToken(received, { META_WEBHOOK_VERIFY_TOKEN: TOKEN })).toBe(false);
  });

  it.each([
    ["missing", {}],
    ["blank", { META_WEBHOOK_VERIFY_TOKEN: "   " }],
  ])("rejects every request and logs the missing variable when the configured token is %s", (_label, env) => {
    const logs = captureLogs();

    expect(isValidMetaVerifyToken("   ", env)).toBe(false);
    expect(logs).toContainEqual(expect.objectContaining({ event: "webhook.verify_token_missing", variable: "META_WEBHOOK_VERIFY_TOKEN" }));
  });
});
