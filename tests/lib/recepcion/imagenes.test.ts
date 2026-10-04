import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_IMAGE_BYTES, parseImageDataUri } from "@/lib/recepcion/imagenes/data-uri";
import { guardarImagenHttp } from "@/lib/recepcion/imagenes/almacen-http";
import { isMediaStorageConfigured } from "@/lib/recepcion/imagenes/config";

const PNG_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString("base64");

describe("reading an image data URI", () => {
  it("returns the mime type and the bytes of an image", () => {
    const parsed = parseImageDataUri(`data:image/png;base64,${PNG_BASE64}`);

    expect(parsed).toEqual({ mimeType: "image/png", bytes: Buffer.from(PNG_BASE64, "base64") });
  });

  it("refuses anything that is not a base64 image", () => {
    expect(parseImageDataUri("data:text/html;base64,PGI+")).toBeNull();
    expect(parseImageDataUri("data:image/png,rawtext")).toBeNull();
    expect(parseImageDataUri("not a data uri")).toBeNull();
  });

  it("flags an image over the size limit without decoding it twice", () => {
    const big = Buffer.alloc(MAX_IMAGE_BYTES + 1, 1).toString("base64");

    expect(parseImageDataUri(`data:image/jpeg;base64,${big}`)).toEqual({ tooLarge: true });
  });
});

describe("the image storage service", () => {
  beforeEach(() => {
    vi.stubEnv("MEDIA_STORAGE_BASE_URL", "https://media.example.test/files");
    vi.stubEnv("MEDIA_STORAGE_TOKEN", "secret-token");
    vi.stubEnv("MEDIA_STORAGE_TIMEOUT_MS", "2500");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is configured only when a base URL is present", () => {
    expect(isMediaStorageConfigured()).toBe(true);
    vi.stubEnv("MEDIA_STORAGE_BASE_URL", "");
    expect(isMediaStorageConfigured()).toBe(false);
  });

  it("posts the bytes with their mime type and the bearer token, with a timeout, and returns the stored path", async () => {
    const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(async () => new Response(JSON.stringify({ ruta: "2026/10/abc.png" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const bytes = Buffer.from(PNG_BASE64, "base64");

    await expect(guardarImagenHttp(bytes, "image/png")).resolves.toEqual({ ruta: "2026/10/abc.png" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://media.example.test/files");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "image/png", Authorization: "Bearer secret-token" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(Buffer.from(init.body as Uint8Array).equals(bytes)).toBe(true);
  });

  it("sends no Authorization header when no token is configured", async () => {
    vi.stubEnv("MEDIA_STORAGE_TOKEN", "");
    const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(async () => new Response(JSON.stringify({ ruta: "x" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await guardarImagenHttp(Buffer.from("a"), "image/png");

    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty("Authorization");
  });

  it("fails when the service answers an error or no path", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 503 })));
    await expect(guardarImagenHttp(Buffer.from("a"), "image/png")).rejects.toThrow(/503/);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    await expect(guardarImagenHttp(Buffer.from("a"), "image/png")).rejects.toThrow(/ruta/);
  });
});
