import { afterEach, describe, expect, it, vi } from "vitest";
import { configureLogger } from "@/lib/observability/logger";
import { downloadWhatsAppMediaAsDataUri } from "@/lib/whatsapp/whatsapp-media";

describe("downloadWhatsAppMediaAsDataUri", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports the file as unreadable and logs whatsapp.media_failed when the download throws", async () => {
    const lines: Array<Record<string, unknown>> = [];
    const restore = configureLogger({ sink: (_level, line) => lines.push(JSON.parse(line)), level: "info" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(downloadWhatsAppMediaAsDataUri("media-1")).resolves.toEqual({ failure: "unreadable" });

    restore();
    expect(lines.find((line) => line.event === "whatsapp.media_failed")).toMatchObject({
      level: "warn",
      error: { name: "TypeError", message: "fetch failed" },
    });
  });

  it("reports a file above the size limit as too large, without downloading it", async () => {
    const fetchMock = vi.fn(async () => Response.json({ url: "https://media.test/x", mime_type: "image/png", file_size: 6 * 1024 * 1024 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadWhatsAppMediaAsDataUri("media-1")).resolves.toEqual({ failure: "too_large" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the image as a data URI when it downloads", async () => {
    const png = Buffer.from([1, 2, 3]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ url: "https://media.test/x", mime_type: "image/png", file_size: 3 }))
        .mockResolvedValueOnce(new Response(png)),
    );

    await expect(downloadWhatsAppMediaAsDataUri("media-1")).resolves.toEqual({
      dataUri: `data:image/png;base64,${png.toString("base64")}`,
    });
  });
});
