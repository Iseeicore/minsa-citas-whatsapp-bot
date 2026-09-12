import type { ConversationEventDao } from "../ports/conversation-event-dao.js";
import { QueueUnavailableError } from "../domain/errors.js";
import { toInboundConversationEvent } from "../domain/inbound-conversation-event.js";

export interface WebhookIngestionService {
  /**
   * Throws a QueueUnavailableError (D9) when the event could not be
   * accepted — the controller does NOT catch this; it propagates to
   * Fastify's centralized error handler, which maps it to 503.
   */
  ingest(rawPayload: unknown): Promise<void>;
}

export interface WebhookIngestionServiceDeps {
  dao: ConversationEventDao;
}

// Owns enqueue and failure semantics for inbound webhook events. The
// service — not the route — builds the domain Entity (D6): the route is a
// thin controller limited to HTTP shape, and parsing domain meaning out of a
// payload is domain work.
export function createWebhookIngestionService(deps: WebhookIngestionServiceDeps): WebhookIngestionService {
  const { dao } = deps;

  return {
    async ingest(rawPayload: unknown): Promise<void> {
      const event = toInboundConversationEvent(rawPayload);

      try {
        await dao.save(event);
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
