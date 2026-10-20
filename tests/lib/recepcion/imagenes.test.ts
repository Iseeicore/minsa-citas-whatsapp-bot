import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_IMAGE_BYTES, parseImageDataUri } from "@/lib/recepcion/imagenes/data-uri";
import { guardarImagenHttp } from "@/lib/recepcion/imagenes/almacen-http";
import { isMediaStorageConfigured } from "@/lib/recepcion/imagenes/config";
import { ImageStorageError } from "@/lib/errors/image-storage-error";
import { ImageStorageFailure } from "@/lib/enums/image-storage-failure";
import { ImageMimeType } from "@/lib/enums/image-mime-type";
import { ImageValidationFailure } from "@/lib/enums/image-validation-failure";
import { esImagenRechazada, validarImagen } from "@/lib/recepcion/imagenes/validacion";
import { almacenEnLaBase } from "@/lib/recepcion/imagenes/almacen-base-de-datos";
import { almacenHttp } from "@/lib/recepcion/imagenes/almacen-http";
import { crearAlmacenEvidencias } from "@/lib/recepcion/imagenes/almacen";

const PNG_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString("base64");

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.from([1, 0, 1, 0])]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const dataUri = (mimeType: string, bytes: Buffer) => `data:${mimeType};base64,${bytes.toString("base64")}`;

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
    const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ruta: "2026/10/abc.png" }), { status: 201 }),
    );
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
    const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ruta: "x" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await guardarImagenHttp(Buffer.from("a"), "image/png");

    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty("Authorization");
  });

  it("fails when the service answers an error or no path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 503 })),
    );
    const rejected = await guardarImagenHttp(Buffer.from("a"), "image/png").catch((caught: unknown) => caught);
    expect(rejected).toBeInstanceOf(ImageStorageError);
    expect(rejected).toMatchObject({
      message: "El servicio de imágenes respondió 503",
      failure: ImageStorageFailure.BAD_STATUS,
      status: 503,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    const withoutPath = await guardarImagenHttp(Buffer.from("a"), "image/png").catch((caught: unknown) => caught);
    expect(withoutPath).toBeInstanceOf(ImageStorageError);
    expect(withoutPath).toMatchObject({
      message: "El servicio de imágenes no devolvió una ruta",
      failure: ImageStorageFailure.MISSING_PATH,
    });
  });
});

describe("validating an evidence image before storing it", () => {
  it.each([
    [ImageMimeType.JPEG, JPEG],
    [ImageMimeType.PNG, PNG],
    [ImageMimeType.WEBP, WEBP],
  ])("accepts %s when its bytes carry the matching file signature", (mimeType, bytes) => {
    expect(validarImagen(dataUri(mimeType, bytes))).toEqual({ mimeType, bytes });
  });

  it("normalizes the declared type to lower case before checking it", () => {
    expect(validarImagen(dataUri("image/PNG", PNG))).toEqual({ mimeType: ImageMimeType.PNG, bytes: PNG });
  });

  it.each([
    ["an SVG", dataUri("image/svg+xml", SVG)],
    ["a GIF", dataUri("image/gif", GIF)],
    ["a PNG declared as JPEG", dataUri("image/jpeg", PNG)],
    ["a JPEG declared as PNG", dataUri("image/png", JPEG)],
    ["a RIFF file that is not WEBP", dataUri("image/webp", Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE")]))],
    ["a truncated PNG signature", dataUri("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))],
    ["an SVG disguised with a PNG type", dataUri("image/png", SVG)],
    ["something that is not a data URI", "not a data uri"],
    ["a non image data URI", "data:text/html;base64,PGI+"],
  ])("rejects %s as an invalid image", (_, value) => {
    expect(validarImagen(value)).toEqual({ failure: ImageValidationFailure.INVALID });
  });

  it("rejects an image over the size limit as too large, before looking at its signature", () => {
    const big = Buffer.alloc(MAX_IMAGE_BYTES + 1, 1).toString("base64");

    expect(validarImagen(`data:image/jpeg;base64,${big}`)).toEqual({ failure: ImageValidationFailure.TOO_LARGE });
  });

  it("tells a rejection apart from a validated image", () => {
    expect(esImagenRechazada(validarImagen("not a data uri"))).toBe(true);
    expect(esImagenRechazada(validarImagen(dataUri(ImageMimeType.PNG, PNG)))).toBe(false);
  });
});

describe("storing evidence images", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    [ImageMimeType.JPEG, JPEG],
    [ImageMimeType.PNG, PNG],
    [ImageMimeType.WEBP, WEBP],
  ])("in the database, the route of a canonical %s data URI is byte-identical to the data URI received", async (mimeType, bytes) => {
    const received = dataUri(mimeType, bytes);
    const imagen = validarImagen(received);
    if (esImagenRechazada(imagen)) throw new TypeError("fixture must be a valid image");

    await expect(almacenEnLaBase.guardar(imagen)).resolves.toEqual({ ruta: received });
  });

  it("through the image service, posts the validated bytes with their type and returns the stored path", async () => {
    vi.stubEnv("MEDIA_STORAGE_BASE_URL", "https://media.example.test/files");
    const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(
      async () => new Response(JSON.stringify({ ruta: "2026/10/abc.png" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(almacenHttp.guardar({ mimeType: ImageMimeType.PNG, bytes: PNG })).resolves.toEqual({ ruta: "2026/10/abc.png" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ "Content-Type": "image/png" });
    expect(Buffer.from(init.body as Uint8Array).equals(PNG)).toBe(true);
  });

  it("through the image service, keeps failing with the storage error", async () => {
    vi.stubEnv("MEDIA_STORAGE_BASE_URL", "https://media.example.test/files");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 503 })),
    );

    const rejected = await almacenHttp.guardar({ mimeType: ImageMimeType.PNG, bytes: PNG }).catch((caught: unknown) => caught);

    expect(rejected).toBeInstanceOf(ImageStorageError);
    expect(rejected).toMatchObject({ failure: ImageStorageFailure.BAD_STATUS, status: 503 });
  });

  it("uses the image service only when it is configured, and the database otherwise", () => {
    vi.stubEnv("MEDIA_STORAGE_BASE_URL", "https://media.example.test/files");
    expect(crearAlmacenEvidencias()).toBe(almacenHttp);

    vi.stubEnv("MEDIA_STORAGE_BASE_URL", "");
    expect(crearAlmacenEvidencias()).toBe(almacenEnLaBase);
  });
});
