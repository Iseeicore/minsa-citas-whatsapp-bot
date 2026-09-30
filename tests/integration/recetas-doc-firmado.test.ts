import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sendTemplateMessage: vi.fn(async () => new Response("{}", { status: 200 })),
}));

vi.mock("@/lib/whatsapp/whatsapp-send", () => ({
  sendTemplateMessage: mocks.sendTemplateMessage,
}));

import { POST } from "@/app/api/recetas/doc-firmado/[token]/route";

const SECRET = "shh-secreto";

function request(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/recetas/doc-firmado/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function call(token: string, body?: unknown) {
  return POST(request(body), { params: Promise.resolve({ token }) });
}

describe("POST /api/recetas/doc-firmado/[token]", () => {
  beforeEach(() => {
    vi.stubEnv("RECETA_CALLBACK_SECRET", SECRET);
    vi.stubEnv("RECETA_TEMPLATE_NAME", "receta_firmada");
    vi.stubEnv("RECETA_TEMPLATE_LANGUAGE", "es");
    mocks.sendTemplateMessage.mockClear();
    mocks.sendTemplateMessage.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers 404 for a wrong token and never touches WhatsApp", async () => {
    const response = await call("token-incorrecto", { uuid: "abc-123", celular: "51987654321" });

    expect(response.status).toBe(404);
    expect(mocks.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it("answers 404 when RECETA_CALLBACK_SECRET is not configured", async () => {
    vi.stubEnv("RECETA_CALLBACK_SECRET", "");

    const response = await call("", { uuid: "abc-123", celular: "51987654321" });

    expect(response.status).toBe(404);
    expect(mocks.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it("answers 400 when the body is missing uuid", async () => {
    const response = await call(SECRET, { celular: "51987654321" });

    expect(response.status).toBe(400);
    expect(mocks.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it("answers 400 when the body is missing celular", async () => {
    const response = await call(SECRET, { uuid: "abc-123" });

    expect(response.status).toBe(400);
    expect(mocks.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it("sends the template with the uuid as the body parameter and answers 200", async () => {
    const response = await call(SECRET, { uuid: "abc-123", celular: "51987654321" });

    expect(response.status).toBe(200);
    expect(mocks.sendTemplateMessage).toHaveBeenCalledWith("51987654321", {
      templateName: "receta_firmada",
      languageCode: "es",
      bodyParams: ["abc-123"],
    });
  });

  it("answers 502 when sendTemplateMessage resolves with a failed response", async () => {
    mocks.sendTemplateMessage.mockResolvedValueOnce(new Response("boom", { status: 500 }));

    const response = await call(SECRET, { uuid: "abc-123", celular: "51987654321" });

    expect(response.status).toBe(502);
  });

  it("answers 502 when sendTemplateMessage throws", async () => {
    mocks.sendTemplateMessage.mockRejectedValueOnce(new TypeError("fetch failed"));

    const response = await call(SECRET, { uuid: "abc-123", celular: "51987654321" });

    expect(response.status).toBe(502);
  });
});
