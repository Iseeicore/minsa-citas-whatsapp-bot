import { describe, expect, it, vi } from "vitest";
import type pino from "pino";
import { TransientFailureError } from "../domain/errors.js";
import { createHttpReniecLookupClient } from "./http-reniec-lookup-client.js";

const BASE_CONFIG = {
  reniecLookupBaseUrl: "https://back.personeros360.pe",
};

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("createHttpReniecLookupClient", () => {
  it("GETs the RENIEC validate URL built from reniecLookupBaseUrl/dni, no auth header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { nombres: "JUAN", apellidoPaterno: "PEREZ", apellidoMaterno: "LOPEZ" } })
    );
    const client = createHttpReniecLookupClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await client.lookup("12345678");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://back.personeros360.pe/api/reniec/validate/12345678");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined();
  });

  it("returns status:found with the three parsed name fields on a successful 2xx body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, data: { nombres: "MARIA", apellidoPaterno: "GARCIA", apellidoMaterno: "RUIZ" } }));
    const client = createHttpReniecLookupClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    const result = await client.lookup("87654321");

    expect(result).toEqual({
      status: "found",
      nombres: "MARIA",
      apellidoPaterno: "GARCIA",
      apellidoMaterno: "RUIZ",
    });
  });

  it("returns status:not_found when the 2xx body carries success:false", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: false }));
    const client = createHttpReniecLookupClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    const result = await client.lookup("11111111");

    expect(result).toEqual({ status: "not_found" });
  });

  it("returns status:not_found on a 404 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    const client = createHttpReniecLookupClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    const result = await client.lookup("22222222");

    expect(result).toEqual({ status: "not_found" });
  });

  it("returns status:not_found on a malformed 2xx body missing name fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { nombres: "SOLO" } }));
    const client = createHttpReniecLookupClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    const result = await client.lookup("33333333");

    expect(result).toEqual({ status: "not_found" });
  });

  it("returns status:not_found when the 2xx body is not valid JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("not json", { status: 200 }));
    const client = createHttpReniecLookupClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    const result = await client.lookup("44444444");

    expect(result).toEqual({ status: "not_found" });
  });

  it("throws TransientFailureError on a 500 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const client = createHttpReniecLookupClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await expect(client.lookup("55555555")).rejects.toBeInstanceOf(TransientFailureError);
  });

  it("throws TransientFailureError when fetch itself rejects (network error / timeout)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network unreachable"));
    const client = createHttpReniecLookupClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await expect(client.lookup("66666666")).rejects.toBeInstanceOf(TransientFailureError);
  });

  it("passes an AbortSignal to fetch so a hung request is bounded", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: false }));
    const client = createHttpReniecLookupClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await client.lookup("77777777");

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("path-injection threat: a DNI containing '../' is URL-encoded and cannot escape the path segment", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: false }));
    const client = createHttpReniecLookupClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await client.lookup("../../etc/passwd");

    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://back.personeros360.pe/api/reniec/validate/${encodeURIComponent("../../etc/passwd")}`
    );
    expect(url).not.toContain("/../");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
