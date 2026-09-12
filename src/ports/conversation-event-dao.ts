import type { InboundConversationEvent } from "../domain/inbound-conversation-event.js";

// Driven port for inbound WhatsApp events (D8: renamed from ConversationQueue
// — a hexagonal driven port and a DAO are the same idea: one interface owned
// by the domain, N implementations owned by infrastructure). Concrete
// adapters (Redis, memory) implement this contract; the composition root
// selects one explicitly (src/composition/select-conversation-event-dao.ts)
// — no adapter is ever chosen implicitly from a failed connection.
//
// `save`, not `enqueue`: this is the one name that survives a future
// relational (MySQL) implementation unchanged — the service's call site does
// not move when the backend changes. The BullMQ job name is an
// adapter-owned constant; the port no longer carries a transport parameter.
export interface ConversationEventDao {
  readonly mode: "redis" | "memory";

  /**
   * Saves one event. Rejects when the event could not be accepted,
   * including when the backend is unreachable — callers (the ingestion
   * service) translate a rejection into QueueUnavailableError (D9).
   */
  save(event: InboundConversationEvent): Promise<void>;

  /**
   * Releases any resources the adapter owns (e.g. the Redis connection).
   * The memory adapter no-ops.
   */
  close(): Promise<void>;
}
