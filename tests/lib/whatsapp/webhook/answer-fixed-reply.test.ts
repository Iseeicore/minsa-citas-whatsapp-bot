import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendFixedReply } from "@/lib/whatsapp/webhook/answer";
import { captureLogs } from "@/tests/support/capture-logs";

const WA_ID = "51987650000";

beforeEach(() => {
  vi.stubEnv("META_PHONE_NUMBER_ID", "123");
  vi.stubEnv("META_ACCESS_TOKEN", "token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendFixedReply", () => {
  it("logs a fixed reply that Meta rejects, with its status and Meta error code, never the text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "Re-engagement message", code: 131047 } }), { status: 400 })),
    );
    const lines = captureLogs();

    await sendFixedReply(WA_ID, "Ocurrió un inconveniente temporal");

    const failure = lines.find((line) => line.event === "whatsapp.send_failed");
    expect(failure).toMatchObject({ level: "error", operation: "fixed_reply", status: 400, errorCodeNumber: 131047 });
    expect(JSON.stringify(failure)).not.toContain(WA_ID);
    expect(JSON.stringify(failure)).not.toContain("inconveniente");
  });

  it("logs nothing when Meta accepts it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ messages: [{ id: "wamid.ok" }] })),
    );
    const lines = captureLogs();

    await sendFixedReply(WA_ID, "Hola");

    expect(lines.filter((line) => line.level === "error")).toEqual([]);
  });
});
