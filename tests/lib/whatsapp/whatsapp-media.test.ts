import { afterEach, describe, expect, it, vi } from "vitest";
import { configureLogger } from "@/lib/observability/logger";
import { downloadWhatsAppMediaAsDataUri } from "@/lib/whatsapp/whatsapp-media";

describe("downloadWhatsAppMediaAsDataUri", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null and logs whatsapp.media_failed when the download throws", async () => {
    const lines: Array<Record<string, unknown>> = [];
    const restore = configureLogger({ sink: (_level, line) => lines.push(JSON.parse(line)), level: "info" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));

    await expect(downloadWhatsAppMediaAsDataUri("media-1")).resolves.toBeNull();

    restore();
    expect(lines.find((line) => line.event === "whatsapp.media_failed")).toMatchObject({
      level: "warn",
      error: { name: "TypeError", message: "fetch failed" },
    });
  });
});
