import {
  BusinessRejectionError,
  FsmContractViolationError,
  MediaTooLargeError,
  QuejasSubmissionClientNotConfiguredError,
  ScheduledCheckSchedulerNotConfiguredError,
} from "./errors.js";

/**
 * "transient" -> BullMQ should retry (with its existing exponential backoff).
 * "business" -> a terminal, non-retriable business stop; the job resolves.
 */
export type WorkerOutcome = "transient" | "business";

// D14: `error-handler.ts` is HTTP-only and meaningless in the worker. Only a
// `BusinessRejectionError` classifies as "business" — everything else,
// INCLUDING an error we have never seen before, classifies as "transient".
// This default is safe because the BullMQ producer already caps
// `attempts: 3` with exponential backoff: an unclassified failure
// dead-letters instead of looping forever, rather than being silently
// misfiled as a business stop that never retries.
//
// D20 (Stage B): `FsmContractViolationError` is ALSO "business" — it is a
// deterministic programmer error (the FSM violated the single-query-effect /
// no-chained-re-entry contract), not a transient infra hiccup. Retrying it
// three times would only delay a dead-letter that retrying cannot avoid.
//
// PR5: `QuejasSubmissionClientNotConfiguredError` is the same class of
// deterministic, never-retriable failure — see errors.ts. Phase 7 wires the
// real QuejasSubmissionClient unconditionally in worker.ts, so this path is
// no longer reachable through conversation-flow.ts; the mapping stays as a
// defensive safety net.
//
// Phase 7 (PR7): `MediaTooLargeError` is ALSO "business" — retrying will
// never make an oversized file smaller. In the normal path,
// conversation-flow.ts's `runQueryEffect` already catches this error inside
// the `quejas_submit` executor and converts it into a citizen-facing
// rejected result (D21) before it would ever reach this classifier; this
// mapping exists as a defensive safety net for any future call site that
// lets it propagate unhandled.
export function classifyWorkerOutcome(err: unknown): WorkerOutcome {
  if (err instanceof BusinessRejectionError) return "business";
  if (err instanceof FsmContractViolationError) return "business";
  if (err instanceof QuejasSubmissionClientNotConfiguredError) return "business";
  if (err instanceof MediaTooLargeError) return "business";
  if (err instanceof ScheduledCheckSchedulerNotConfiguredError) return "business";
  return "transient";
}
