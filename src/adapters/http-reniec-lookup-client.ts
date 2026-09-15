import type pino from "pino";
import type { ReniecLookupClient, ReniecLookupResult, ReniecPerson } from "../ports/reniec-lookup-client.js";
import { TransientFailureError } from "../domain/errors.js";

export interface HttpReniecLookupClientDeps {
  config: {
    reniecLookupBaseUrl: string;
  };
  logger: pino.Logger;
  /** Injected for testability (no module mocks) — defaults to Node's global `fetch`. */
  fetchImpl?: typeof fetch;
}

// Same convention as meta-whatsapp-sender.ts (design note: Stage A owns it,
// Stage B reuses it verbatim rather than re-inventing a timeout).
const REQUEST_TIMEOUT_MS = 10_000;

interface ReniecApiResponseBody {
  readonly success?: boolean;
  readonly data?: {
    readonly nombres?: string;
    readonly apellidoPaterno?: string;
    readonly apellidoMaterno?: string;
  };
}

function isReniecPerson(data: ReniecApiResponseBody["data"]): data is ReniecPerson {
  return (
    typeof data?.nombres === "string" &&
    typeof data?.apellidoPaterno === "string" &&
    typeof data?.apellidoMaterno === "string"
  );
}

// Synchronous constructor, no I/O at construction time — same discipline as
// meta-whatsapp-sender.ts: a factory that returns the port, never throws.
export function createHttpReniecLookupClient(deps: HttpReniecLookupClientDeps): ReniecLookupClient {
  const { config, logger, fetchImpl = fetch } = deps;

  return {
    async lookup(dni: string): Promise<ReniecLookupResult> {
      const url = `${config.reniecLookupBaseUrl}/api/reniec/validate/${encodeURIComponent(dni)}`;

      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new TransientFailureError("[reniec-lookup:http] Fallo de red al consultar RENIEC", { cause: err });
      }

      // 404 is a documented "not found" shape, per design — distinct from
      // every other non-2xx, which stays transient.
      if (response.status === 404) {
        return { status: "not_found" };
      }

      if (!response.ok) {
        const responseBody = await response.text().catch(() => "");
        logger.error(
          { status: response.status, body: responseBody },
          "[reniec-lookup:http] RENIEC respondió con error"
        );
        throw new TransientFailureError(`[reniec-lookup:http] RENIEC respondió ${response.status}`);
      }

      // Total mapping (same discipline as D6's inbound mapper): the RENIEC
      // error-path body shape is unconfirmed (design's own open question,
      // spec's flagged risk). Rather than guess at an undocumented error
      // contract, any 2xx body that is not valid JSON, does not carry
      // `success: true`, or is missing any of the three name fields is
      // treated as a conservative "not_found" business outcome — never
      // thrown. This is a flagged assumption, not a silent guess: RENIEC's
      // real non-happy-path shapes remain unconfirmed pending the design's
      // own open question.
      let body: ReniecApiResponseBody;
      try {
        body = (await response.json()) as ReniecApiResponseBody;
      } catch {
        return { status: "not_found" };
      }

      if (body.success === true && isReniecPerson(body.data)) {
        return { status: "found", ...body.data };
      }

      return { status: "not_found" };
    },
  };
}
