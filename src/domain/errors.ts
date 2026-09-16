// Transport-agnostic by design (D9): no `statusCode` field. Keeping the
// status decision entirely inside src/error-handler.ts keeps it in exactly
// one greppable place, AND keeps these classes usable from src/worker.ts,
// which has no HTTP surface at all — an error class that knew about 503
// would be nonsense there. Dependency direction stays correct: the HTTP
// adapter (error-handler.ts) depends on the domain, never the reverse.
export class AppError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The conversation-event DAO could not accept the event (unreachable backend, etc). */
export class QueueUnavailableError extends AppError {}

/** The request body is not parseable JSON. */
export class MalformedPayloadError extends AppError {}

// D14: worker-only outcome classification (error-handler.ts is HTTP-only and
// meaningless in src/worker.ts). Unknown errors default to transient at the
// classification site (classifyWorkerOutcome, PR6) — the producer already
// caps attempts:3 with exponential backoff, so an unknown failure dead-letters
// instead of looping forever, rather than being misfiled as a business stop
// that never retries.

/** A retriable infrastructure failure (Redis down, Meta Graph API timeout/5xx, etc). BullMQ should retry the job. */
export class TransientFailureError extends AppError {}

/** A terminal, non-retriable business stop (e.g. the citizen's flow ends by rule, not by failure). BullMQ should NOT retry the job. */
export class BusinessRejectionError extends AppError {}

// D20 (Stage B): a deterministic FSM/service bug — a turn emitted more than
// one query effect, or a bounded re-entry (conversation-flow.ts) itself
// emitted another query effect. This will NEVER succeed on retry, so it is
// classified "business" in worker-outcome.ts: three retries would only delay
// the dead-letter for a bug that retrying cannot fix.
/** The FSM violated D20's single-query-effect / no-chained-re-entry contract. Never retriable. */
export class FsmContractViolationError extends AppError {}

// PR5: `quejas_submit` is Phase 6/7, D21-gated — its real HTTP client
// (`http-quejas-submission-client.ts`) does not exist yet. A `quejas_submit`
// query effect reaching conversation-flow.ts before Phase 7 wires the real
// client is a deployment/configuration gap, not a citizen-triggerable
// condition or an infra hiccup — retrying will never succeed, so it
// classifies "business" in worker-outcome.ts, same rationale as
// FsmContractViolationError.
/** `ConversationFlowServiceDeps.quejasSubmissionClient` is not yet configured (Phase 7, D21-gated). Never retriable. */
export class QuejasSubmissionClientNotConfiguredError extends AppError {}

// D29/D30 (Stage C1, PR4): a `schedule_check` effect reached
// conversation-flow.ts's `runScheduleEffects` but
// `ConversationFlowServiceDeps.scheduledCheckScheduler` is not yet
// configured. `scheduledCheckScheduler` is OPTIONAL until Phase 5 wires the
// real BullMQ-backed adapter into worker.ts (redis-scheduled-check-scheduler.ts
// does not exist yet) — same precedent as `QuejasSubmissionClientNotConfiguredError`
// above: a deployment/configuration gap, not a citizen-triggerable condition
// or an infra hiccup, so retrying will never succeed.
/** `ConversationFlowServiceDeps.scheduledCheckScheduler` is not yet configured (Phase 5). Never retriable. */
export class ScheduledCheckSchedulerNotConfiguredError extends AppError {}

// Phase 6 (Stage C1, PR6): a `validate_user` query effect reached
// conversation-flow.ts's `runQueryEffect` but
// `ConversationFlowServiceDeps.minsaIdentityClient` is not yet configured.
// `minsaIdentityClient` is OPTIONAL until Phase 8 wires the real
// `HttpMinsaIdentityClient` into worker.ts's composition root (task 8.1) —
// same precedent as `QuejasSubmissionClientNotConfiguredError` and
// `ScheduledCheckSchedulerNotConfiguredError` above: a deployment/
// configuration gap, not a citizen-triggerable condition or an infra
// hiccup, so retrying will never succeed.
/** `ConversationFlowServiceDeps.minsaIdentityClient` is not yet configured (Phase 8). Never retriable. */
export class MinsaIdentityClientNotConfiguredError extends AppError {}

// D21 (Stage B, PR6): thrown by `meta-media-downloader.ts` when hop 1's
// declared `file_size` exceeds `MAX_MEDIA_BYTES` (40 MiB) — enforced BEFORE
// hop 2 ever fetches a byte, per the design's resource-exhaustion threat
// entry. Deliberately its own class rather than `TransientFailureError`:
// design states the `quejas_submit` executor (Phase 7, not this PR) is meant
// to catch it and convert it to a citizen-facing "rejected" business
// outcome, not retry it as a transient infra hiccup — retrying will not make
// the image smaller.
/** The downloaded media exceeds the accepted size ceiling. Never retriable as-is. */
export class MediaTooLargeError extends AppError {}
