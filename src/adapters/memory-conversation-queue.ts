import type pino from "pino";
import type { ConversationQueue } from "../ports/conversation-queue.js";

export interface MemoryConversationQueueDeps {
  logger: pino.Logger;
}

// Dev-only adapter: single-process, jobs lost on restart, must not run with
// multiple replicas or in production (see composition/select-conversation-queue.ts,
// which is the only place allowed to construct this). Each factory call owns
// its own closure-scoped backlog — no module-level mutable state (D4).
export function createMemoryConversationQueue(deps: MemoryConversationQueueDeps): ConversationQueue {
  const { logger } = deps;
  const backlog: Array<{ name: string; data: unknown; receivedAt: string }> = [];

  return {
    mode: "memory",
    async add(name, data) {
      backlog.push({ name, data, receivedAt: new Date().toISOString() });
      logger.info(
        { event: name, pending: backlog.length },
        "[conversation-queue:memory] evento encolado"
      );
    },
    async close() {
      // No external connection to release.
    },
  };
}
