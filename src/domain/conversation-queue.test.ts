import { describe, expect, it } from "vitest";
import { CONVERSATION_QUEUE_NAME } from "./conversation-queue.js";

// D30: a single exported constant, imported by BOTH the producer
// (redis-conversation-event-dao.ts) and the consumer (worker.ts). This test
// pins the exact literal value the producer/consumer name-mismatch fix
// (3aaaa75) restored, so a future edit to this file cannot silently drift
// the two sides apart again without failing a test.
//
// Triangulation skipped: this is a purely structural constant definition
// (task 1.3) — there is exactly one possible output, no branching.
describe("CONVERSATION_QUEUE_NAME", () => {
  it('is the literal "conversation-events" BullMQ queue/job name', () => {
    expect(CONVERSATION_QUEUE_NAME).toBe("conversation-events");
  });
});
