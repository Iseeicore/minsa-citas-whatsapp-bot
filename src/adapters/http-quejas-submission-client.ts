import type pino from "pino";
import type { QuejaPayload, QuejaSubmissionResult, QuejasSubmissionClient } from "../ports/quejas-submission-client.js";
import { TransientFailureError } from "../domain/errors.js";

export interface HttpQuejasSubmissionClientDeps {
  config: {
    quejasApiBaseUrl: string;
  };
  logger: pino.Logger;
  /** Injected for testability (no module mocks) — defaults to Node's global `fetch`. */
  fetchImpl?: typeof fetch;
}

// Same convention as meta-whatsapp-sender.ts / http-reniec-lookup-client.ts /
// meta-media-downloader.ts (design note: Stage A owns it, Stage B reuses it
// verbatim).
const REQUEST_TIMEOUT_MS = 10_000;

// D21 GATE CLEARED FOR IMPLEMENTATION PER EXPLICIT USER INSTRUCTION — the
// underlying base64/data-URI `imagen` acceptance question is STILL
// UNVALIDATED against the real quejas endpoint (design's "HARD PRE-APPLY
// GATE"). This adapter is built and unit-tested entirely against FAKES; no
// test anywhere in this codebase calls the real quejas endpoint
// (back-end-ministerioescucha-production.up.railway.app) or the real Meta
// Graph API. Do not wire this client against production traffic until base64
// acceptance is confirmed either by a real test call proving a retrievable
// image, or by the API owner's written statement naming the accepted
// encoding — see quejas-imagen-encoding.ts for the same loud caveat.
function buildRequestBody(payload: QuejaPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {
    dni: payload.dni,
    nombre_completo: payload.nombre_completo,
    celular: payload.celular,
    queja: payload.queja,
    imagen: payload.imagen,
  };
  if (payload.latitud !== undefined) body.latitud = payload.latitud;
  if (payload.longitud !== undefined) body.longitud = payload.longitud;
  return body;
}

// D24: a narrow, deliberate divergence from D15's uniform "every non-2xx is
// transient" rule (the rule every other adapter in this codebase follows).
// A quejas 4xx (except 408/429, which stay transient — rate-limit/timeout
// signals, not payload verdicts) is a payload-validation verdict that will
// never succeed on retry, so it is returned as a "rejected" business
// outcome instead of thrown. RENIEC does NOT diverge this way (see
// http-reniec-lookup-client.ts) because it has no payload to reject.
function isRejectedNotTransientStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

// Synchronous constructor, no I/O at construction time — same discipline as
// the other adapters in this codebase: a factory that returns the port,
// never throws.
export function createHttpQuejasSubmissionClient(deps: HttpQuejasSubmissionClientDeps): QuejasSubmissionClient {
  const { config, logger, fetchImpl = fetch } = deps;
  // Trailing slash is significant (design's own note) — the quejas API
  // rejects/redirects a request missing it.
  const url = `${config.quejasApiBaseUrl}/api/v1/quejas/`;

  return {
    async submit(payload: QuejaPayload): Promise<QuejaSubmissionResult> {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildRequestBody(payload)),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new TransientFailureError("[quejas-submission:http] Fallo de red al enviar el reclamo", { cause: err });
      }

      if (response.ok) {
        // Total mapping (same discipline as D6's inbound mapper and RENIEC's
        // own 2xx handling): the quejas success-body shape is unconfirmed —
        // reference is deliberately not parsed from an unverified field name.
        return { status: "accepted" };
      }

      if (isRejectedNotTransientStatus(response.status)) {
        const responseBody = await response.text().catch(() => "");
        logger.warn(
          { status: response.status, body: responseBody },
          "[quejas-submission:http] El API de quejas rechazó el envío (D24: verdicto de validación, no reintentable)"
        );
        return { status: "rejected", reason: `http_${response.status}` };
      }

      const responseBody = await response.text().catch(() => "");
      logger.error(
        { status: response.status, body: responseBody },
        "[quejas-submission:http] El API de quejas respondió con error transitorio"
      );
      throw new TransientFailureError(`[quejas-submission:http] El API de quejas respondió ${response.status}`);
    },
  };
}
