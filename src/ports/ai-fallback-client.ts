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

export type UbigeoFieldName = "departamento" | "provincia" | "distrito";

// Granular per-field correction (no-SDD fast path, explicit user decision):
// replaces the earlier all-or-nothing "flagged" shape. `valorIngresado` is
// always sourced from the ORIGINAL `UbigeoAiCheckInput`, never trusted from
// the AI's own echo, so the FSM's re-prompt always quotes exactly what the
// citizen typed. `sugerencia` is confined to the field's own category by the
// system prompt (a distrito suggestion is only ever another distrito, etc.).
export interface UbigeoFieldIssue {
  readonly field: UbigeoFieldName;
  readonly valorIngresado: string;
  readonly sugerencia?: string;
}

// Three outcomes, matching how the FSM branches: proceed (valid), correct
// 1-3 specific fields (field_issues — the FSM restarts the whole 3-question
// collection when all 3 are flagged, and runs a targeted per-field
// confirm/correct sequence when 1-2 are), or proceed anyway (unavailable).
// "unavailable" is a SEPARATE, distinct outcome from "valid" — the AI never
// having actually run is worth being able to tell apart in logs, but the
// FSM's handler treats it identically to "valid" (fail-open: an AI outage
// must never be able to block a real citizen from booking a real
// appointment).
export type UbigeoAiValidationResult =
  | { status: "ubigeo_ai_valid" }
  | { status: "ubigeo_ai_field_issues"; issues: readonly UbigeoFieldIssue[]; detalle: string }
  | { status: "ubigeo_ai_unavailable" };

export interface AiFallbackClient {
  checkConnection(): Promise<AiConnectionCheckResult>;
  /** Never throws (same total-mapping discipline as every other adapter) — a
   *  failure of any kind maps to `ubigeo_ai_unavailable`, never a thrown error. */
  validateUbigeo(input: UbigeoAiCheckInput): Promise<UbigeoAiValidationResult>;
}
