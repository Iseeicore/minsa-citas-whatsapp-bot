import crypto from "node:crypto";
import type pino from "pino";
import type { MinsaIdentityClient, ValidateUserResult, VerifyCodeResult } from "../ports/minsa-identity-client.js";
import { TransientFailureError } from "../domain/errors.js";
import { signMinsaRequest } from "../domain/minsa-request-signature.js";

export interface HttpMinsaIdentityClientDeps {
  config: {
    minsaApiHost: string;
    minsaIntegrationSecret: string;
    /** D32: adapter-owned, never a port parameter — see design's "conversation_id is adapter-owned" note. */
    citaConversationIdPlaceholder: string;
  };
  logger: pino.Logger;
  /** Injected for testability (no module mocks) — defaults to Node's global `fetch`. */
  fetchImpl?: typeof fetch;
}

// Same convention as meta-whatsapp-sender.ts / http-reniec-lookup-client.ts /
// http-quejas-submission-client.ts (design note: Stage A owns it, reused
// verbatim here).
const REQUEST_TIMEOUT_MS = 10_000;

// D27: two SEPARATE literal status sets, never one shared list. The two are
// deliberately different in the ground truth — a 401 on validate-user is an
// HMAC/secret failure (transient/infra), while a 401 on verify-code is the
// citizen's wrong code (business-invalid). Conflating them into one shared
// constant is the exact edit this design explicitly forbids.
const VALIDATE_USER_BUSINESS_STATUSES: readonly number[] = [400, 404, 422];
const VERIFY_CODE_BUSINESS_STATUSES: readonly number[] = [400, 401, 422];

interface ValidateUserApiResponseBody {
  readonly valido?: boolean;
  readonly twofa_id?: string;
  readonly mensaje?: string;
}

interface VerifyCodeApiResponseBody {
  readonly valido?: boolean;
  readonly token?: string;
  readonly token_type?: string;
  readonly expires_in?: number;
}

// D26: `timestamp`/`requestId` are generated HERE, at the adapter boundary —
// signMinsaRequest itself stays a pure function of explicit inputs, with zero
// clock/RNG of its own. Timestamp is SECONDS epoch (`Math.floor(Date.now() /
// 1000).toString()`) — confirmed against the real Twilio Function source
// (validar-dni/verificar-codigo), which is the ground truth this adapter
// replicates. The design's open question flagged this as unconfirmed
// ms-vs-s; ms was wrong (401 "Credenciales de integración inválidas" against
// the live endpoint) — seconds is correct.
function buildSignedHeaders(secret: string, bodyJson: string): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const requestId = crypto.randomUUID();
  const { signature } = signMinsaRequest({ secret, timestamp, requestId, bodyJson });

  return {
    accept: "application/json",
    "Content-Type": "application/json",
    "X-WhatsApp-Timestamp": timestamp,
    "X-WhatsApp-Request-Id": requestId,
    "X-WhatsApp-Signature": signature,
  };
}

// Synchronous constructor, no I/O at construction time — same discipline as
// the other adapters in this codebase: a factory that returns the port,
// never throws.
export function createHttpMinsaIdentityClient(deps: HttpMinsaIdentityClientDeps): MinsaIdentityClient {
  const { config, logger, fetchImpl = fetch } = deps;

  return {
    async validateUser(numeroDocumento: string): Promise<ValidateUserResult> {
      // Serialize ONCE — this exact string is signed AND sent. Re-serializing
      // for the request is the classic HMAC defect (key order / whitespace
      // divergence) the design explicitly forbids.
      const bodyJson = JSON.stringify({
        numero_documento: numeroDocumento,
        conversation_id: config.citaConversationIdPlaceholder,
      });
      const headers = buildSignedHeaders(config.minsaIntegrationSecret, bodyJson);

      let response: Response;
      try {
        response = await fetchImpl(`${config.minsaApiHost}/api/v1/whatsapp/validate-user`, {
          method: "POST",
          headers,
          body: bodyJson,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new TransientFailureError("[minsa-identity:http] Fallo de red al validar DNI", { cause: err });
      }

      // D27: validate-user's own business-invalid set. Distinct from
      // verify-code's — see the constant's comment above.
      if (VALIDATE_USER_BUSINESS_STATUSES.includes(response.status)) {
        return { status: "not_valid" };
      }

      if (!response.ok) {
        const responseBody = await response.text().catch(() => "");
        logger.error(
          { status: response.status, body: responseBody },
          "[minsa-identity:http] validate-user respondió con error transitorio"
        );
        throw new TransientFailureError(`[minsa-identity:http] validate-user respondió ${response.status}`);
      }

      // Total mapping (same discipline as RENIEC's and quejas' own 2xx
      // handling): the exact response JSON shape is unconfirmed against the
      // live endpoint (design's flagged risk). Any 2xx body that is not
      // valid JSON, does not carry `valido: true`, or is missing `twofa_id`
      // is treated as a conservative "not_valid" business outcome — never
      // thrown.
      let body: ValidateUserApiResponseBody;
      try {
        body = (await response.json()) as ValidateUserApiResponseBody;
      } catch {
        return { status: "not_valid" };
      }

      if (body.valido === true && typeof body.twofa_id === "string") {
        return body.mensaje !== undefined
          ? { status: "valid", twofaId: body.twofa_id, mensaje: body.mensaje }
          : { status: "valid", twofaId: body.twofa_id };
      }

      return body.mensaje !== undefined ? { status: "not_valid", mensaje: body.mensaje } : { status: "not_valid" };
    },

    async verifyCode(input: { twofaId: string; code: string }): Promise<VerifyCodeResult> {
      const bodyJson = JSON.stringify({
        conversation_id: config.citaConversationIdPlaceholder,
        twofa_id: input.twofaId,
        code: input.code,
      });
      const headers = buildSignedHeaders(config.minsaIntegrationSecret, bodyJson);

      let response: Response;
      try {
        response = await fetchImpl(`${config.minsaApiHost}/api/v1/whatsapp/verify-code`, {
          method: "POST",
          headers,
          body: bodyJson,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new TransientFailureError("[minsa-identity:http] Fallo de red al verificar el código", { cause: err });
      }

      // D27: verify-code's own business-invalid set — NOT the same set as
      // validate-user's (401 means something different in each).
      if (VERIFY_CODE_BUSINESS_STATUSES.includes(response.status)) {
        return { status: "invalid" };
      }

      if (!response.ok) {
        const responseBody = await response.text().catch(() => "");
        logger.error(
          { status: response.status, body: responseBody },
          "[minsa-identity:http] verify-code respondió con error transitorio"
        );
        throw new TransientFailureError(`[minsa-identity:http] verify-code respondió ${response.status}`);
      }

      let body: VerifyCodeApiResponseBody;
      try {
        body = (await response.json()) as VerifyCodeApiResponseBody;
      } catch {
        return { status: "invalid" };
      }

      if (
        body.valido === true &&
        typeof body.token === "string" &&
        typeof body.token_type === "string" &&
        typeof body.expires_in === "number"
      ) {
        return { status: "verified", token: body.token, tokenType: body.token_type, expiresIn: body.expires_in };
      }

      return { status: "invalid" };
    },
  };
}
