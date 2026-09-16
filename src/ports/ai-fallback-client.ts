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

export interface AiFallbackClient {
  checkConnection(): Promise<AiConnectionCheckResult>;
}
