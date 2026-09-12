import { describe, expect, it, vi } from "vitest";
import type { ConversationQueue } from "../ports/conversation-queue.js";
import { createWebhookIngestionService } from "./webhook-ingestion.js";

function fakeQueue(add: ReturnType<typeof vi.fn>): ConversationQueue {
  return { mode: "redis", add, close: vi.fn().mockResolvedValue(undefined) };
}

describe("createWebhookIngestionService", () => {
  it("delegates the event to the queue's add() with the fixed 'inbound-event' name", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const service = createWebhookIngestionService({ queue: fakeQueue(add) });
    const event = { entry: [{ id: "123" }] };

    await service.ingest(event);

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith("inbound-event", event);
  });

  it("propagates the queue's rejection to the caller (translated to 503 by the controller)", async () => {
    const add = vi.fn().mockRejectedValue(new Error("queue unreachable"));
    const service = createWebhookIngestionService({ queue: fakeQueue(add) });

    await expect(service.ingest({ entry: [] })).rejects.toThrow("queue unreachable");
  });
});
