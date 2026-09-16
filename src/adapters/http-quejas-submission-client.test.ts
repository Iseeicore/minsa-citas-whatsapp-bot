import { describe, expect, it, vi } from "vitest";
import type pino from "pino";
import { TransientFailureError } from "../domain/errors.js";
import type { QuejaPayload } from "../ports/quejas-submission-client.js";
import { createHttpQuejasSubmissionClient } from "./http-quejas-submission-client.js";

const BASE_CONFIG = {
  quejasApiBaseUrl: "https://back-end-ministerioescucha-production.up.railway.app",
};

const BASE_PAYLOAD: QuejaPayload = {
  dni: "12345678",
  nombre_completo: "Juan Perez",
  celular: "51999999999",
  queja: "Fuga de agua",
  imagen: "data:image/jpeg;base64,AQID",
};

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("createHttpQuejasSubmissionClient", () => {
  it("POSTs JSON to {quejasApiBaseUrl}/api/v1/quejas/ (trailing slash significant), no auth header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const client = createHttpQuejasSubmissionClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await client.submit(BASE_PAYLOAD);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://back-end-ministerioescucha-production.up.railway.app/api/v1/quejas/");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("sends the payload fields verbatim, omitting latitud/longitud when absent", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const client = createHttpQuejasSubmissionClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await client.submit(BASE_PAYLOAD);

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      dni: BASE_PAYLOAD.dni,
      nombre_completo: BASE_PAYLOAD.nombre_completo,
      celular: BASE_PAYLOAD.celular,
      queja: BASE_PAYLOAD.queja,
      imagen: BASE_PAYLOAD.imagen,
    });
    expect(body).not.toHaveProperty("latitud");
    expect(body).not.toHaveProperty("longitud");
  });

  it("includes latitud/longitud in the body when present", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const client = createHttpQuejasSubmissionClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await client.submit({ ...BASE_PAYLOAD, latitud: -12.05, longitud: -77.04 });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.latitud).toBe(-12.05);
    expect(body.longitud).toBe(-77.04);
  });

  it("sends null dni/nombre_completo/imagen through unchanged (sin-DNI / no-photo paths)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const client = createHttpQuejasSubmissionClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await client.submit({ ...BASE_PAYLOAD, dni: null, nombre_completo: null, imagen: null });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.dni).toBeNull();
    expect(body.nombre_completo).toBeNull();
    expect(body.imagen).toBeNull();
  });

  it("returns status:accepted on a 2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "abc-123" }, 201));
    const client = createHttpQuejasSubmissionClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    const result = await client.submit(BASE_PAYLOAD);

    expect(result).toEqual({ status: "accepted" });
  });

  it("returns status:accepted even when the 2xx body is not valid JSON (total mapping, never throws on body shape)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("not json", { status: 200 }));
    const client = createHttpQuejasSubmissionClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    const result = await client.submit(BASE_PAYLOAD);

    expect(result).toEqual({ status: "accepted" });
  });

  // D24: the QUEJAS-SPECIFIC divergence from D15's uniform rule — a 4xx
  // (except 408/429) is a returned "rejected" business outcome, not a thrown
  // TransientFailureError, because it is a payload-validation verdict
  // retrying cannot fix.
  it("D24: returns status:rejected on a 422 response (payload-validation verdict, not thrown)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: "imagen inválida" }, 422));
    const client = createHttpQuejasSubmissionClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    const result = await client.submit(BASE_PAYLOAD);

    expect(result).toEqual({ status: "rejected", reason: "http_422" });
  });

  it("D24: returns status:rejected on a 400 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 400));
    const client = createHttpQuejasSubmissionClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    const result = await client.submit(BASE_PAYLOAD);

    expect(result).toEqual({ status: "rejected", reason: "http_400" });
  });

  it("D24: 408 is TRANSIENT, not rejected — excluded from the 4xx-rejected rule", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 408));
    const client = createHttpQuejasSubmissionClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await expect(client.submit(BASE_PAYLOAD)).rejects.toBeInstanceOf(TransientFailureError);
  });

  it("D24: 429 is TRANSIENT, not rejected — excluded from the 4xx-rejected rule", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 429));
    const client = createHttpQuejasSubmissionClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await expect(client.submit(BASE_PAYLOAD)).rejects.toBeInstanceOf(TransientFailureError);
  });

  it("throws TransientFailureError on a 500 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const client = createHttpQuejasSubmissionClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await expect(client.submit(BASE_PAYLOAD)).rejects.toBeInstanceOf(TransientFailureError);
  });

  it("throws TransientFailureError when fetch itself rejects (network error / timeout)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network unreachable"));
    const client = createHttpQuejasSubmissionClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await expect(client.submit(BASE_PAYLOAD)).rejects.toBeInstanceOf(TransientFailureError);
  });

  it("passes an AbortSignal to fetch so a hung request is bounded", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const client = createHttpQuejasSubmissionClient({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await client.submit(BASE_PAYLOAD);

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
