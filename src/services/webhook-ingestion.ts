import type { ConversationQueue } from "../ports/conversation-queue.js";

export interface WebhookIngestionService {
  /** Rejects when the event could not be accepted; the controller maps that to 503. */
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
      await queue.add("inbound-event", event);
    },
  };
}
