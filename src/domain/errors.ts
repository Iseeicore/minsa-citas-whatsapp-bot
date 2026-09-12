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
