import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadWhatsAppMediaAsDataUri } from "@/lib/whatsapp/whatsapp-media";
import { InboundMediaKind } from "@/lib/enums/inbound-media-kind";
import { MediaFailure } from "@/lib/enums/media-failure";
import { captureLogs } from "@/tests/support/capture-logs";

const UNREADABLE = { kind: InboundMediaKind.FAILURE, failure: MediaFailure.UNREADABLE };

describe("downloadWhatsAppMediaAsDataUri", () => {
  beforeEach(() => {
    vi.stubEnv("META_ACCESS_TOKEN", "token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reports the file as unreadable without calling Meta when META_ACCESS_TOKEN is missing", async () => {
    vi.stubEnv("META_ACCESS_TOKEN", "");
    const lines = captureLogs();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadWhatsAppMediaAsDataUri("media-1")).resolves.toEqual(UNREADABLE);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(lines).toContainEqual(expect.objectContaining({ event: "whatsapp.config_missing", variable: "META_ACCESS_TOKEN" }));
  });

  it("reports the file as unreadable and logs whatsapp.media_failed when the download throws", async () => {
    const lines = captureLogs();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(downloadWhatsAppMediaAsDataUri("media-1")).resolves.toEqual(UNREADABLE);

    expect(lines.find((line) => line.event === "whatsapp.media_failed")).toMatchObject({
      level: "warn",
      error: { name: "TypeError", message: "fetch failed" },
    });
  });

  it("logs the status when Meta refuses the media information", async () => {
    const lines = captureLogs();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );

    await expect(downloadWhatsAppMediaAsDataUri("media-1")).resolves.toEqual(UNREADABLE);

    expect(lines.find((line) => line.event === "whatsapp.media_failed")).toMatchObject({ level: "warn", step: "info", status: 404 });
  });

  it("logs a media information without url or type as incomplete", async () => {
    const lines = captureLogs();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ file_size: 3 })),
    );

    await expect(downloadWhatsAppMediaAsDataUri("media-1")).resolves.toEqual(UNREADABLE);

    expect(lines.find((line) => line.event === "whatsapp.media_failed")).toMatchObject({ step: "info_incomplete" });
  });

  it("logs the status when Meta refuses the file itself", async () => {
    const lines = captureLogs();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ url: "https://media.test/x", mime_type: "image/png", file_size: 3 }))
        .mockResolvedValueOnce(new Response("", { status: 403 })),
    );

    await expect(downloadWhatsAppMediaAsDataUri("media-1")).resolves.toEqual(UNREADABLE);

    expect(lines.find((line) => line.event === "whatsapp.media_failed")).toMatchObject({ level: "warn", step: "download", status: 403 });
  });

  it("reports a file above the size limit as too large, without downloading it", async () => {
    const fetchMock = vi.fn(async () => Response.json({ url: "https://media.test/x", mime_type: "image/png", file_size: 6 * 1024 * 1024 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadWhatsAppMediaAsDataUri("media-1")).resolves.toEqual({
      kind: InboundMediaKind.FAILURE,
      failure: MediaFailure.TOO_LARGE,
    });
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
      kind: InboundMediaKind.DATA,
      dataUri: `data:image/png;base64,${png.toString("base64")}`,
    });
  });
});
