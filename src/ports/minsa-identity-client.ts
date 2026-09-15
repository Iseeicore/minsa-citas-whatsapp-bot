// Driven port for the MINSA WhatsApp identity endpoints (design D26/D27,
// spec's "MinsaIdentityClient Port Contract" requirement). Hexagonal driven
// port — one HTTP implementation owned by infrastructure
// (src/adapters/http-minsa-identity-client.ts).
//
// Binding constraint (design's "Contracts" section): `FsmSystemEvent.result`
// is one FLAT union, narrowed per handler by `result.status`. The existing
// literals "found" | "not_found" | "accepted" | "rejected" are already taken
// by ReniecLookupResult/QuejaSubmissionResult, so these two result types use
// a DIFFERENT, disjoint literal set: "valid" / "not_valid" for validateUser,
// "verified" / "invalid" for verifyCode. verifyCode's failure is "invalid",
// never "rejected" — do not rename these to match the spec's earlier
// prose ("not_registered") without also updating the FSM's disjointness
// requirement.
export type ValidateUserResult =
  | { status: "valid"; twofaId: string; mensaje?: string }
  | { status: "not_valid"; mensaje?: string };

export type VerifyCodeResult =
  | { status: "verified"; token: string; tokenType: string; expiresIn: number }
  | { status: "invalid" };

export interface MinsaIdentityClient {
  /** Validates a citizen's DNI against MINSA (already format-validated by `isValidDniFormat` upstream). */
  validateUser(numeroDocumento: string): Promise<ValidateUserResult>;
  /** Verifies the OTP code MINSA sent after a successful `validateUser` call. */
  verifyCode(input: { twofaId: string; code: string }): Promise<VerifyCodeResult>;
}
