import type pino from "pino";
import type { ConversationEventDao } from "../ports/conversation-event-dao.js";
import type { InboundConversationEvent } from "../domain/inbound-conversation-event.js";

export interface MemoryConversationEventDaoDeps {
  logger: pino.Logger;
}

// Dev-only adapter: single-process, jobs lost on restart, must not run with
// multiple replicas or in production (see
// composition/select-conversation-event-dao.ts, which is the only place
// allowed to construct this). Each factory call owns its own closure-scoped
// backlog — no module-level mutable state (D4).
export function createMemoryConversationEventDao(deps: MemoryConversationEventDaoDeps): ConversationEventDao {
  const { logger } = deps;
  const backlog: Array<{ event: InboundConversationEvent; receivedAt: string }> = [];

  return {
    mode: "memory",
    async save(event: InboundConversationEvent) {
      backlog.push({ event, receivedAt: new Date().toISOString() });
      logger.info(
        { eventId: event.eventId, pending: backlog.length },
        "[conversation-event-dao:memory] evento guardado"
      );
    },
    async close() {
      // No external connection to release.
    },
  };
}
