import type { ConversationQueue } from "../ports/conversation-queue.js";
import { QueueUnavailableError } from "../domain/errors.js";

export interface WebhookIngestionService {
  /**
   * Throws a QueueUnavailableError (D9) when the event could not be
   * accepted — the controller does NOT catch this; it propagates to
   * Fastify's centralized error handler, which maps it to 503.
   */
  ingest(event: unknown): Promise<void>;
}

export interface WebhookIngestionServiceDeps {
  queue: ConversationQueue;
}

// Owns enqueue and failure semantics for inbound webhook events. The seam,
// not the logic, is the deliverable: this is where change 3's MINSA/domain
// work lands without touching the controller.
export function createWebhookIngestionService(deps: WebhookIngestionServiceDeps): WebhookIngestionService {
  const { queue } = deps;

  return {
    async ingest(event: unknown): Promise<void> {
      try {
        await queue.add("inbound-event", event);
      } catch (cause) {
        // D9: the service wraps, not the adapter — the port contract already
        // promises "rejects when the event could not be accepted", so this
        // translation is total and lossless. Adapters stay free of
        // app-level error types, preserving the hexagonal boundary.
        throw new QueueUnavailableError("conversation-event DAO rejected the event", { cause });
      }
    },
  };
}
