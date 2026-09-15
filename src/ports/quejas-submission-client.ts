// Driven port for complaint (queja) submission (design D20/D21/D24, spec's
// "QuejasSubmissionClient Port and Payload Contract" requirement).
//
// TYPES ONLY — pulled forward from Phase 7 (task 7.1) into PR5, same
// resequencing precedent as Phase 3's `reniecLookupBaseUrl` and Phase 4's
// `ReniecLookupClient` wiring: PR5's `FsmQueryEffect`/`FsmSystemEvent`
// widening (conversation-fsm.ts) needs `QuejaSubmissionResult` to compile.
// The real HTTP implementation (`src/adapters/http-quejas-submission-client.ts`)
// stays Phase 7/D21-gated — nothing in this file performs I/O.
export interface QuejaPayload {
  readonly dni: string | null;
  readonly nombre_completo: string | null;
  /** D17/D22: sourced from InboundConversationEvent.from, never from ConversationSession.slots. */
  readonly celular: string;
  readonly queja: string;
  /** Produced by encodeImagenField (D21) — Phase 6 scope. Always null until then. */
  readonly imagen: string | null;
  readonly latitud?: number;
  readonly longitud?: number;
}

// D24: a narrow, deliberate divergence from D15's uniform "every non-2xx is
// transient" rule — a 4xx (except 408/429) is a returned "rejected" result,
// not a thrown TransientFailureError, because it is a payload-validation
// verdict retrying cannot fix.
export type QuejaSubmissionResult =
  | { status: "accepted"; reference?: string }
  | { status: "rejected"; reason: string };

export interface QuejasSubmissionClient {
  /** Submits a citizen complaint. Non-2xx other than a classified rejection throws TransientFailureError (D24, Phase 7). */
  submit(payload: QuejaPayload): Promise<QuejaSubmissionResult>;
}
