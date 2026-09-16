// Driven port for RENIEC DNI lookups (design D20/D21, spec's
// "ReniecLookupClient Port" requirement). Hexagonal driven port — one HTTP
// implementation owned by infrastructure (src/adapters/http-reniec-lookup-client.ts).
//
// `ReniecPerson` is deliberately structurally identical to `ReniecFullName`
// (src/domain/reniec-name-match.ts, PR2): same three required string fields.
// A `{ status: "found", ... }` result therefore satisfies `namesMatch()`'s
// second parameter directly, with zero adaptation — the pure domain module
// was written first and this port's success shape was designed to match it.
export interface ReniecPerson {
  readonly nombres: string;
  readonly apellidoPaterno: string;
  readonly apellidoMaterno: string;
}

export type ReniecLookupResult = ({ status: "found" } & ReniecPerson) | { status: "not_found" };

export interface ReniecLookupClient {
  /** Looks up a DNI (already format-validated by `isValidDniFormat` upstream) against RENIEC. */
  lookup(dni: string): Promise<ReniecLookupResult>;
}
