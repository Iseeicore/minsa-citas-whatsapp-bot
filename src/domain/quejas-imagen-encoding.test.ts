import { describe, expect, it } from "vitest";
import type { DownloadedMedia } from "../ports/whatsapp-media-downloader.js";
import { encodeImagenField } from "./quejas-imagen-encoding.js";

describe("encodeImagenField", () => {
  it("encodes bytes+mimeType as a data URI (D21 assumed shape — UNVALIDATED against the real endpoint)", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic bytes
    const media: DownloadedMedia = { bytes, mimeType: "image/jpeg", sizeBytes: bytes.length };

    const result = encodeImagenField(media);

    expect(result).toBe(`data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`);
  });

  it("triangulation: different bytes/mimeType produce a different, correctly-tagged payload", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]); // PNG magic bytes
    const media: DownloadedMedia = { bytes, mimeType: "image/png", sizeBytes: bytes.length };

    const result = encodeImagenField(media);

    expect(result).toBe(`data:image/png;base64,${Buffer.from(bytes).toString("base64")}`);
    expect(result).not.toContain("image/jpeg");
  });

  it("round-trips: the base64 payload decodes back to the exact original bytes", () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252, 0, 255]);
    const media: DownloadedMedia = { bytes, mimeType: "image/webp", sizeBytes: bytes.length };

    const result = encodeImagenField(media);
    const payload = result.slice(result.indexOf(",") + 1);
    const decoded = new Uint8Array(Buffer.from(payload, "base64"));

    expect(decoded).toEqual(bytes);
  });
});
