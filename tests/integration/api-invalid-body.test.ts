import crypto from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as webhookPost } from "@/app/webhook/whatsapp/route";
import { POST as sandboxPost } from "@/app/api/sandbox/route";

const SECRET = "test-app-secret";

describe("a body that is not JSON gets the shared 400 INVALID_BODY, not a 500", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("on the WhatsApp webhook, even when it carries a valid Meta signature", async () => {
    vi.stubEnv("META_APP_SECRET", SECRET);
    const body = "{not json";
    const signature = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");

    const response = await webhookPost(
      new NextRequest("http://localhost/webhook/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-signature-256": signature },
        body,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "INVALID_BODY" });
  });

  it("on the Sandbox", async () => {
    vi.stubEnv("SANDBOX_ENABLED", "true");

    const response = await sandboxPost(
      new NextRequest("http://localhost/api/sandbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "INVALID_BODY" });
  });
});
