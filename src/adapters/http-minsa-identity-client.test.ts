import { describe, expect, it, vi } from "vitest";
import type pino from "pino";
import { TransientFailureError } from "../domain/errors.js";
import { signMinsaRequest } from "../domain/minsa-request-signature.js";
import { createHttpMinsaIdentityClient } from "./http-minsa-identity-client.js";

const BASE_CONFIG = {
  minsaApiHost: "https://dminsadigital.minsa.gob.pe/back",
  minsaIntegrationSecret: "test-integration-secret",
  citaConversationIdPlaceholder: "550e8400-e29b-41d4-a716-446655440000",
};

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Recomputes the signature from the headers + the EXACT body string that was
// sent, and compares it against the X-WhatsApp-Signature header. This is the
// design's "adapter MUST serialize once" invariant made assertable: if the
// adapter ever re-serialized the body for signing vs. for the request, this
// recomputed signature would not match what was sent.
function assertSignatureMatchesSentBody(init: RequestInit) {
  const headers = init.headers as Record<string, string>;
  const timestamp = headers["X-WhatsApp-Timestamp"];
  const requestId = headers["X-WhatsApp-Request-Id"];
  const signature = headers["X-WhatsApp-Signature"];
  expect(timestamp).toBeTruthy();
  expect(requestId).toBeTruthy();
  expect(signature).toMatch(/^sha256=/);

  const recomputed = signMinsaRequest({
    secret: BASE_CONFIG.minsaIntegrationSecret,
    timestamp,
    requestId,
    bodyJson: init.body as string,
  });
  expect(signature).toBe(recomputed.signature);
}

describe("createHttpMinsaIdentityClient", () => {
  describe("validateUser", () => {
    it("POSTs numero_documento/conversation_id to {minsaApiHost}/api/v1/whatsapp/validate-user, HMAC headers present", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ valido: true, twofa_id: "twofa-abc" }));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await client.validateUser("12345678");

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://dminsadigital.minsa.gob.pe/back/api/v1/whatsapp/validate-user");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        numero_documento: "12345678",
        conversation_id: BASE_CONFIG.citaConversationIdPlaceholder,
      });

      assertSignatureMatchesSentBody(init);
    });

    it("returns status:valid with twofaId on a 2xx response carrying valido:true", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse({ valido: true, twofa_id: "twofa-xyz", mensaje: "ok" }));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUser("12345678");

      expect(result).toEqual({ status: "valid", twofaId: "twofa-xyz", mensaje: "ok" });
    });

    it("returns status:not_valid on a 2xx response carrying valido:false", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ valido: false, mensaje: "no registrado" }));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUser("12345678");

      expect(result).toEqual({ status: "not_valid", mensaje: "no registrado" });
    });

    it("returns status:not_valid on a 2xx body missing twofa_id even when valido:true (conservative total mapping)", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ valido: true }));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUser("12345678");

      expect(result).toEqual({ status: "not_valid" });
    });

    it("returns status:not_valid when the 2xx body is not valid JSON (total mapping, never throws on body shape)", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response("not json", { status: 200 }));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUser("12345678");

      expect(result).toEqual({ status: "not_valid" });
    });

    it.each([400, 404, 422])("D27: returns status:not_valid on a %i response (business-invalid, not thrown)", async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, status));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.validateUser("12345678");

      expect(result).toEqual({ status: "not_valid" });
    });

    it("D27: throws TransientFailureError on a 401 response (validateUser's set has no 401)", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 401));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await expect(client.validateUser("12345678")).rejects.toBeInstanceOf(TransientFailureError);
    });

    it("throws TransientFailureError on a 500 response", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await expect(client.validateUser("12345678")).rejects.toBeInstanceOf(TransientFailureError);
    });

    it("throws TransientFailureError when fetch itself rejects (network error / timeout)", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error("network unreachable"));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await expect(client.validateUser("12345678")).rejects.toBeInstanceOf(TransientFailureError);
    });

    it("passes an AbortSignal to fetch so a hung request is bounded", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ valido: false }));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await client.validateUser("12345678");

      const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe("verifyCode", () => {
    it("POSTs conversation_id/twofa_id/code to {minsaApiHost}/api/v1/whatsapp/verify-code, HMAC headers present", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse({ valido: true, token: "tok-abc", token_type: "Bearer", expires_in: 3600 })
      );
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await client.verifyCode({ twofaId: "twofa-abc", code: "123456" });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://dminsadigital.minsa.gob.pe/back/api/v1/whatsapp/verify-code");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        conversation_id: BASE_CONFIG.citaConversationIdPlaceholder,
        twofa_id: "twofa-abc",
        code: "123456",
      });

      assertSignatureMatchesSentBody(init);
    });

    it("returns status:verified with token/tokenType/expiresIn on a 2xx response carrying valido:true", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse({ valido: true, token: "tok-xyz", token_type: "Bearer", expires_in: 1800 })
      );
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.verifyCode({ twofaId: "twofa-abc", code: "123456" });

      expect(result).toEqual({ status: "verified", token: "tok-xyz", tokenType: "Bearer", expiresIn: 1800 });
    });

    it("returns status:invalid on a 2xx response carrying valido:false", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ valido: false }));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.verifyCode({ twofaId: "twofa-abc", code: "000000" });

      expect(result).toEqual({ status: "invalid" });
    });

    it("returns status:invalid on a 2xx body missing token fields even when valido:true (conservative total mapping)", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ valido: true }));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.verifyCode({ twofaId: "twofa-abc", code: "123456" });

      expect(result).toEqual({ status: "invalid" });
    });

    it("returns status:invalid when the 2xx body is not valid JSON (total mapping, never throws on body shape)", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response("not json", { status: 200 }));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.verifyCode({ twofaId: "twofa-abc", code: "123456" });

      expect(result).toEqual({ status: "invalid" });
    });

    it.each([400, 401, 422])("D27: returns status:invalid on a %i response (business-invalid, not thrown)", async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, status));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      const result = await client.verifyCode({ twofaId: "twofa-abc", code: "123456" });

      expect(result).toEqual({ status: "invalid" });
    });

    it("D27: throws TransientFailureError on a 404 response (verifyCode's set has no 404, unlike validateUser's)", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 404));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await expect(client.verifyCode({ twofaId: "twofa-abc", code: "123456" })).rejects.toBeInstanceOf(
        TransientFailureError
      );
    });

    it("throws TransientFailureError on a 500 response", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await expect(client.verifyCode({ twofaId: "twofa-abc", code: "123456" })).rejects.toBeInstanceOf(
        TransientFailureError
      );
    });

    it("throws TransientFailureError when fetch itself rejects (network error / timeout)", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error("network unreachable"));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await expect(client.verifyCode({ twofaId: "twofa-abc", code: "123456" })).rejects.toBeInstanceOf(
        TransientFailureError
      );
    });

    it("passes an AbortSignal to fetch so a hung request is bounded", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ valido: false }));
      const client = createHttpMinsaIdentityClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

      await client.verifyCode({ twofaId: "twofa-abc", code: "123456" });

      const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
