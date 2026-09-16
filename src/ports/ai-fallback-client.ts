// Driven port for the AI fallback (D-pending, no-SDD exploration spike):
// mirrors the existing driven-port shape (ReniecLookupClient,
// MinsaIdentityClient) — an interface only, zero I/O, zero vendor SDK
// imports here. `checkConnection()` is the first, minimal capability: prove
// the configured API key can actually reach the provider before any real
// fallback-generation method is added to this port.
export interface AiConnectionCheckResult {
  readonly ok: boolean;
  /** Human-readable detail for logging — never includes the API key. */
  readonly detail: string;
}

export interface UbigeoAiCheckInput {
  readonly departamento: string;
  readonly provincia: string;
  readonly distrito: string;
}

// Two literals only, matching how the FSM actually branches: proceed vs
// re-prompt. `estado`/`detalle`/`sugerencia` survive on the "flagged" branch
// so the FSM can build a specific re-prompt message instead of the generic
// "not found" one the real MINSA lookup already gives. "unavailable" is a
// SEPARATE, distinct outcome from "valid" — the AI never having actually
// run is worth being able to tell apart in logs, but the FSM's handler
// treats it identically to "valid" (fail-open: an AI outage must never be
// able to block a real citizen from booking a real appointment).
export type UbigeoAiValidationResult =
  | { status: "ubigeo_ai_valid" }
  | { status: "ubigeo_ai_flagged"; estado: "invalido" | "inconsistente"; detalle: string; sugerencia?: string }
  | { status: "ubigeo_ai_unavailable" };

export interface AiFallbackClient {
  checkConnection(): Promise<AiConnectionCheckResult>;
  /** Never throws (same total-mapping discipline as every other adapter) — a
   *  failure of any kind maps to `ubigeo_ai_unavailable`, never a thrown error. */
  validateUbigeo(input: UbigeoAiCheckInput): Promise<UbigeoAiValidationResult>;
}
