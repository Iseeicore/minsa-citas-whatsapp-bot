import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureLogger } from "@/lib/observability/logger";
import { sendAndRecordCtaUrl, sendAndRecordEffect, sendTemplateMessage, sendTypingIndicator } from "@/lib/whatsapp/whatsapp-send";
import { SendType } from "@/lib/enums/send-type";

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

    await sendAndRecordEffect(null, "51987654321", { kind: SendType.TEXT, text: "hola" });

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

describe("sendTemplateMessage", () => {
  beforeEach(() => {
    vi.stubEnv("META_PHONE_NUMBER_ID", "123");
    vi.stubEnv("META_ACCESS_TOKEN", "token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("posts a Graph API template message with the correct URL, method, headers and body", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendTemplateMessage("51987654321", {
      templateName: "receta_firmada",
      languageCode: "es",
      bodyParams: ["abc-123"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];

    expect(url).toBe("https://graph.facebook.com/v21.0/123/messages");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(options.body as string)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      recipient: "51987654321",
      type: "template",
      template: {
        name: "receta_firmada",
        language: { code: "es" },
        components: [{ type: "body", parameters: [{ type: "text", text: "abc-123" }] }],
      },
    });
  });
});
