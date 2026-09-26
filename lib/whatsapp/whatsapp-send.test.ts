import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureLogger } from "@/lib/observability/logger";
import { sendAndRecordCtaUrl, sendAndRecordEffect, sendTypingIndicator } from "@/lib/whatsapp/whatsapp-send";

type Line = { level: string; event: string } & Record<string, unknown>;

describe("WhatsApp send failures reach the masked logger", () => {
  let lines: Line[];
  let restore: () => void;

  beforeEach(() => {
    lines = [];
    restore = configureLogger({ sink: (_level, line) => lines.push(JSON.parse(line) as Line), level: "info" });
    vi.stubEnv("META_PHONE_NUMBER_ID", "123");
    vi.stubEnv("META_ACCESS_TOKEN", "token");
  });

  afterEach(() => {
    restore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("logs a Graph API error with its status and a masked, truncated body", async () => {
    const body = `{"error":{"message":"Recipient 51987654321 is not a valid WhatsApp user","details":"${"x".repeat(400)}"}}`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 400 })));

    await sendAndRecordEffect(null, "51987654321", { kind: "send_text", text: "hola" });

    const failure = lines.find((line) => line.event === "whatsapp.send_failed");
    expect(failure).toMatchObject({ level: "error", operation: "send_effect", status: 400 });
    expect(JSON.stringify(failure)).not.toContain("51987654321");
    expect(String(failure?.response).length).toBeLessThanOrEqual(201);
  });

  it("logs a network error while sending a CTA button", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));

    await sendAndRecordCtaUrl(null, "51987654321", { bodyText: "Regístrate", buttonText: "Ir", url: "https://example.org" });

    expect(lines.find((line) => line.event === "whatsapp.send_failed")).toMatchObject({
      level: "error",
      operation: "send_cta_url",
      error: { name: "TypeError", message: "fetch failed" },
    });
  });

  it("logs a failed typing indicator as a warning and never throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));

    await expect(sendTypingIndicator("wamid.1")).resolves.toBeUndefined();

    expect(lines.find((line) => line.event === "whatsapp.typing_failed")).toMatchObject({ level: "warn" });
  });
});
