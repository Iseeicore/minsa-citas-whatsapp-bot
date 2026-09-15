import { BusinessRejectionError } from "./errors.js";

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
export function classifyWorkerOutcome(err: unknown): WorkerOutcome {
  if (err instanceof BusinessRejectionError) return "business";
  return "transient";
}
