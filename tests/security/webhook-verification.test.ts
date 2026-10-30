import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/webhook/whatsapp/route";
import { ApiErrorCode } from "@/lib/enums/api-error-code";

const TOKEN = "verify-token-de-prueba";

const verification = (params: Record<string, string>) =>
  GET(new NextRequest(`http://localhost/webhook/whatsapp?${new URLSearchParams(params).toString()}`));

describe("GET /webhook/whatsapp: Meta's subscription check", () => {
  beforeEach(() => {
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", TOKEN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("echoes the challenge when the token matches", async () => {
    const response = await verification({ "hub.mode": "subscribe", "hub.verify_token": TOKEN, "hub.challenge": "1234" });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("1234");
  });

  it.each([
    ["a wrong token", { "hub.mode": "subscribe", "hub.verify_token": "otro", "hub.challenge": "1234" }],
    ["another mode", { "hub.mode": "unsubscribe", "hub.verify_token": TOKEN, "hub.challenge": "1234" }],
    ["no parameters", {}],
  ])("answers 403 with the standard error format for %s", async (_label, params) => {
    const response = await verification(params);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: ApiErrorCode.FORBIDDEN });
  });

  it("answers 403 when the verify token is not configured, even if the request sends none", async () => {
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "");

    const response = await verification({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1234" });

    expect(response.status).toBe(403);
  });
});
