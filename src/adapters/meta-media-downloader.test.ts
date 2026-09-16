import { describe, expect, it, vi } from "vitest";
import type pino from "pino";
import { MediaTooLargeError, TransientFailureError } from "../domain/errors.js";
import { createMetaMediaDownloader, MAX_MEDIA_BYTES } from "./meta-media-downloader.js";

const BASE_CONFIG = {
  metaGraphApiVersion: "v21.0",
  metaAccessToken: "test-access-token",
};

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function bytesResponse(bytes: Uint8Array, status = 200) {
  return new Response(bytes, { status });
}

function metadataBody(overrides: Partial<{ url: string; mime_type: string; file_size: number }> = {}) {
  return {
    url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=abc123",
    mime_type: "image/jpeg",
    file_size: 1024,
    ...overrides,
  };
}

describe("createMetaMediaDownloader", () => {
  it("assembles the hop-1 URL from metaGraphApiVersion/mediaId and sends Bearer auth, no query params", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(metadataBody()))
      .mockResolvedValueOnce(bytesResponse(bytes));
    const downloader = createMetaMediaDownloader({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await downloader.download("media-id-1");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [hop1Url, hop1Init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(hop1Url).toBe("https://graph.facebook.com/v21.0/media-id-1");
    expect((hop1Init.headers as Record<string, string>).Authorization).toBe("Bearer test-access-token");
  });

  it("fetches hop 2's returned URL verbatim with the same Bearer auth, and returns bytes+mime+size", async () => {
    const bytes = new Uint8Array([10, 20, 30, 40]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(metadataBody({ mime_type: "image/png" })))
      .mockResolvedValueOnce(bytesResponse(bytes));
    const downloader = createMetaMediaDownloader({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    const result = await downloader.download("media-id-2");

    const [hop2Url, hop2Init] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(hop2Url).toBe("https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=abc123");
    expect((hop2Init.headers as Record<string, string>).Authorization).toBe("Bearer test-access-token");
    expect(result.mimeType).toBe("image/png");
    expect(result.sizeBytes).toBe(bytes.length);
    expect(Array.from(result.bytes)).toEqual(Array.from(bytes));
  });

  it("passes an AbortSignal on both hops so a hung request is bounded", async () => {
    const bytes = new Uint8Array([1]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(metadataBody()))
      .mockResolvedValueOnce(bytesResponse(bytes));
    const downloader = createMetaMediaDownloader({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await downloader.download("media-id-3");

    const [, hop1Init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const [, hop2Init] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(hop1Init.signal).toBeInstanceOf(AbortSignal);
    expect(hop2Init.signal).toBeInstanceOf(AbortSignal);
  });

  it("accepts a .fbcdn.net subdomain as a valid hop-2 host (allowlist triangulation)", async () => {
    const bytes = new Uint8Array([9, 9]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(metadataBody({ url: "https://scontent.xx.fbcdn.net/v/t1/img.jpg" })))
      .mockResolvedValueOnce(bytesResponse(bytes));
    const downloader = createMetaMediaDownloader({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    const result = await downloader.download("media-id-4");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.sizeBytes).toBe(bytes.length);
  });

  it("throws TransientFailureError on a hop-1 non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}, 500));
    const downloader = createMetaMediaDownloader({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await expect(downloader.download("media-id-5")).rejects.toBeInstanceOf(TransientFailureError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws TransientFailureError on a hop-2 non-2xx response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(metadataBody()))
      .mockResolvedValueOnce(jsonResponse({}, 500));
    const downloader = createMetaMediaDownloader({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await expect(downloader.download("media-id-6")).rejects.toBeInstanceOf(TransientFailureError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws TransientFailureError when fetch itself rejects on either hop (network error / timeout)", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("network unreachable"));
    const downloader = createMetaMediaDownloader({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await expect(downloader.download("media-id-7")).rejects.toBeInstanceOf(TransientFailureError);
  });

  it("resource-exhaustion threat: a hop-1 file_size above MAX_MEDIA_BYTES throws MediaTooLargeError BEFORE hop 2 is fetched", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(metadataBody({ file_size: MAX_MEDIA_BYTES + 1 })));
    const downloader = createMetaMediaDownloader({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await expect(downloader.download("media-id-8")).rejects.toBeInstanceOf(MediaTooLargeError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("allows a file_size exactly at MAX_MEDIA_BYTES (boundary)", async () => {
    const bytes = new Uint8Array(4);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(metadataBody({ file_size: MAX_MEDIA_BYTES })))
      .mockResolvedValueOnce(bytesResponse(bytes));
    const downloader = createMetaMediaDownloader({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    const result = await downloader.download("media-id-9");

    expect(result.sizeBytes).toBe(bytes.length);
  });

  it("SSRF threat: an http:// hop-2 URL is rejected WITHOUT issuing hop 2's fetch", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(metadataBody({ url: "http://attacker.test/x" })));
    const downloader = createMetaMediaDownloader({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await expect(downloader.download("media-id-10")).rejects.toBeInstanceOf(TransientFailureError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("SSRF threat: an https:// URL on a non-allowlisted host is rejected WITHOUT issuing hop 2's fetch", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(metadataBody({ url: "https://attacker.test/steal" })));
    const downloader = createMetaMediaDownloader({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await expect(downloader.download("media-id-11")).rejects.toBeInstanceOf(TransientFailureError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("SSRF threat: a lookalike host (evil-lookaside.fbsbx.com.attacker.test) is rejected", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(metadataBody({ url: "https://lookaside.fbsbx.com.attacker.test/x" }))
      );
    const downloader = createMetaMediaDownloader({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await expect(downloader.download("media-id-12")).rejects.toBeInstanceOf(TransientFailureError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws TransientFailureError when hop 1's body is not valid JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("not json", { status: 200 }));
    const downloader = createMetaMediaDownloader({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await expect(downloader.download("media-id-13")).rejects.toBeInstanceOf(TransientFailureError);
  });

  it("throws TransientFailureError when hop 1's body has no url field", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ mime_type: "image/jpeg" }));
    const downloader = createMetaMediaDownloader({ config: BASE_CONFIG, logger: fakeLogger(), fetchImpl });

    await expect(downloader.download("media-id-14")).rejects.toBeInstanceOf(TransientFailureError);
  });
});
