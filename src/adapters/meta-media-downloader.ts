import type pino from "pino";
import type { DownloadedMedia, WhatsappMediaDownloader } from "../ports/whatsapp-media-downloader.js";
import { MediaTooLargeError, TransientFailureError } from "../domain/errors.js";

export interface MetaMediaDownloaderDeps {
  config: {
    metaGraphApiVersion: string;
    metaAccessToken: string;
  };
  logger: pino.Logger;
  /** Injected for testability (no module mocks) — defaults to Node's global `fetch`. */
  fetchImpl?: typeof fetch;
}

// Same convention as meta-whatsapp-sender.ts / http-reniec-lookup-client.ts
// (design note: Stage A owns it, Stage B reuses it verbatim).
const REQUEST_TIMEOUT_MS = 10_000;

// D21: 2 MiB hard ceiling on the downloaded image, enforced from hop 1's
// declared `file_size` BEFORE hop 2 ever fetches a byte — inline base64
// inflates the wire payload ~33%, so this doubles as the design's
// resource-exhaustion threat-matrix guard.
export const MAX_MEDIA_BYTES = 2_097_152;

// D21 SSRF guard: hop 2's URL is response-body-controlled (hop 1 hands it
// back from the Graph API), so it is untrusted input the moment this server
// reads it. https-only + an explicit hostname allowlist — never a blocklist.
//
// FLAGGED ASSUMPTION: these three hosts are named directly in the design
// (D21) as Meta's documented CDN pattern; they have not been independently
// re-verified against Meta's current docs as part of this PR. If Meta
// rotates or adds a CDN host outside this list, hop 2 fails closed
// (TransientFailureError) instead of silently widening the allowlist — a
// deliberate fail-closed default, worth re-checking if photo submission
// starts failing systematically.
const ALLOWED_MEDIA_HOST_SUFFIXES = ["lookaside.fbsbx.com", ".fbcdn.net", "graph.facebook.com"];

function isAllowedMediaHost(hostname: string): boolean {
  return ALLOWED_MEDIA_HOST_SUFFIXES.some((suffix) =>
    suffix.startsWith(".") ? hostname.endsWith(suffix) : hostname === suffix
  );
}

/**
 * Validates hop 2's URL BEFORE any fetch is issued. Throws (never fetches)
 * on a non-https scheme or a hostname outside the allowlist — including
 * lookalike hosts like `lookaside.fbsbx.com.attacker.test`, which
 * `URL.hostname` reports as its own full label, not a suffix match.
 */
function assertSafeMediaUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    throw new TransientFailureError(
      "[media-downloader:meta] La Graph API devolvió una URL de medio inválida",
      { cause: err }
    );
  }
  if (parsed.protocol !== "https:" || !isAllowedMediaHost(parsed.hostname)) {
    throw new TransientFailureError(
      `[media-downloader:meta] URL de medio rechazada por el guardia SSRF (host: ${parsed.hostname})`
    );
  }
}

interface MediaMetadataResponseBody {
  readonly url?: string;
  readonly mime_type?: string;
  readonly file_size?: number;
}

// Synchronous constructor, no I/O at construction time — same discipline as
// meta-whatsapp-sender.ts and http-reniec-lookup-client.ts: a factory that
// returns the port, never throws.
export function createMetaMediaDownloader(deps: MetaMediaDownloaderDeps): WhatsappMediaDownloader {
  const { config, logger, fetchImpl = fetch } = deps;

  // Shared error wrapper (same convention as the other adapters): a network
  // failure and a non-2xx response both surface uniformly as
  // TransientFailureError, on either hop.
  async function authorizedGet(url: string, hopLabel: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${config.metaAccessToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new TransientFailureError(`[media-downloader:meta] Fallo de red en ${hopLabel}`, { cause: err });
    }

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      logger.error(
        { status: response.status, body: responseBody, hop: hopLabel },
        "[media-downloader:meta] La Graph API respondió con error"
      );
      throw new TransientFailureError(`[media-downloader:meta] ${hopLabel} respondió ${response.status}`);
    }

    return response;
  }

  return {
    async download(mediaId: string): Promise<DownloadedMedia> {
      // Hop 1: media id -> metadata (short-lived download URL, mime type, size).
      const metadataUrl = `https://graph.facebook.com/${config.metaGraphApiVersion}/${encodeURIComponent(mediaId)}`;
      const metadataResponse = await authorizedGet(metadataUrl, "hop 1 (metadata)");

      let body: MediaMetadataResponseBody;
      try {
        body = (await metadataResponse.json()) as MediaMetadataResponseBody;
      } catch (err) {
        throw new TransientFailureError(
          "[media-downloader:meta] La respuesta de metadata no es JSON válido",
          { cause: err }
        );
      }

      if (typeof body.url !== "string" || body.url.length === 0) {
        throw new TransientFailureError("[media-downloader:meta] La metadata no incluyó una URL de descarga");
      }

      // Resource-exhaustion guard — enforced BEFORE hop 2, from hop 1's
      // declared size alone. A missing file_size is not treated as "safe";
      // it simply skips this guard and relies on hop 2's own response.
      if (typeof body.file_size === "number" && body.file_size > MAX_MEDIA_BYTES) {
        throw new MediaTooLargeError(
          `[media-downloader:meta] El archivo (${body.file_size} bytes) excede el límite de ${MAX_MEDIA_BYTES} bytes`
        );
      }

      // SSRF guard — must run and throw BEFORE hop 2's fetch is issued.
      assertSafeMediaUrl(body.url);

      // Hop 2: the short-lived URL -> raw bytes. Fetched verbatim (not
      // re-serialized through URL.toString()) to avoid any reformatting.
      const byteResponse = await authorizedGet(body.url, "hop 2 (bytes)");
      const bytes = new Uint8Array(await byteResponse.arrayBuffer());

      return {
        bytes,
        mimeType: body.mime_type ?? "application/octet-stream",
        sizeBytes: bytes.length,
      };
    },
  };
}
