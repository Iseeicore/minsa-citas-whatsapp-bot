// Driven port for inbound WhatsApp events. Concrete adapters (Redis, memory)
// implement this contract; the composition root selects one explicitly
// (src/composition/select-conversation-queue.ts) — no adapter is ever chosen
// implicitly from a failed connection.
export interface ConversationQueue {
  readonly mode: "redis" | "memory";

  /**
   * Enqueues one event. Rejects when the event could not be accepted,
   * including when the backend is unreachable — callers (the ingestion
   * service) translate a rejection into the caller-visible 503.
   */
  add(name: string, data: unknown): Promise<void>;

  /**
   * Releases any resources the adapter owns (e.g. the Redis connection).
   * The memory adapter no-ops.
   */
  close(): Promise<void>;
}
