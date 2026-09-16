import type pino from "pino";
import type { AiConnectionCheckResult, AiFallbackClient } from "../ports/ai-fallback-client.js";

export interface GoogleAiClientDeps {
  config: { googleClientApiKey: string };
  logger: pino.Logger;
  /** Injected for testability (no module mocks) — defaults to Node's global `fetch`. */
  fetchImpl?: typeof fetch;
}

// Same convention as http-reniec-lookup-client.ts / http-minsa-identity-client.ts.
const REQUEST_TIMEOUT_MS = 10_000;

// GET /v1beta/models is Google's own recommended zero-cost way to verify an
// API key: it lists the account's available models with no generation
// (no token cost), so it doubles as an auth + connectivity check without
// spending a real completion call.
const GOOGLE_AI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

interface GoogleAiModelsResponseBody {
  readonly models?: readonly unknown[];
}

// Synchronous constructor, no I/O at construction time — same discipline as
// every other adapter in this codebase: a factory that returns the port,
// never throws.
export function createGoogleAiClient(deps: GoogleAiClientDeps): AiFallbackClient {
  const { config, logger, fetchImpl = fetch } = deps;

  return {
    async checkConnection(): Promise<AiConnectionCheckResult> {
      const url = `${GOOGLE_AI_MODELS_URL}?key=${encodeURIComponent(config.googleClientApiKey)}`;

      let response: Response;
      try {
        response = await fetchImpl(url, { method: "GET", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      } catch (err) {
        const detail = err instanceof Error ? err.message : "error de red desconocido";
        logger.error({ err }, "[google-ai:http] Fallo de red al conectar con Google AI");
        return { ok: false, detail: `Fallo de red: ${detail}` };
      }

      // 401/403 is Google's own shape for an invalid/unauthorized key —
      // never thrown, this is exactly the business outcome the check exists
      // to report.
      if (response.status === 401 || response.status === 403) {
        return { ok: false, detail: `API key inválida o sin permisos (HTTP ${response.status})` };
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        logger.error({ status: response.status, body }, "[google-ai:http] Google AI respondió con error");
        return { ok: false, detail: `Google AI respondió HTTP ${response.status}` };
      }

      // Total mapping, same discipline as the other adapters: a 2xx with an
      // unparsable/unexpected body still proves the key authenticates —
      // report ok without a model count rather than treating it as failure.
      let modelCount: number | undefined;
      try {
        const body = (await response.json()) as GoogleAiModelsResponseBody;
        modelCount = Array.isArray(body.models) ? body.models.length : undefined;
      } catch {
        modelCount = undefined;
      }

      return {
        ok: true,
        detail:
          modelCount !== undefined
            ? `Conexión establecida (${modelCount} modelo(s) disponible(s)).`
            : "Conexión establecida.",
      };
    },
  };
}
