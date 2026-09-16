// D30: a single exported constant for the BullMQ queue/job name, imported by
// BOTH the producer (redis-conversation-event-dao.ts) and the consumer
// (worker.ts). Previously each side held its own local literal — they drifted
// apart (fixed in 3aaaa75), and the worker silently received no jobs the
// producer enqueued. Sharing one constant makes that class of bug a
// compile-time impossibility instead of a code-review duty.
export const CONVERSATION_QUEUE_NAME = "conversation-events";
