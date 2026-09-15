import { BusinessRejectionError, FsmContractViolationError } from "./errors.js";

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
export function classifyWorkerOutcome(err: unknown): WorkerOutcome {
  if (err instanceof BusinessRejectionError) return "business";
  if (err instanceof FsmContractViolationError) return "business";
  return "transient";
}
