import { describe, expect, it, vi } from "vitest";
import type { ConversationQueue } from "../ports/conversation-queue.js";
import { QueueUnavailableError } from "../domain/errors.js";
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

  it("wraps a DAO rejection in a QueueUnavailableError, preserving the original cause (D9 — the centralized error handler maps this to 503)", async () => {
    const originalError = new Error("queue unreachable");
    const add = vi.fn().mockRejectedValue(originalError);
    const service = createWebhookIngestionService({ queue: fakeQueue(add) });

    const rejection = await service.ingest({ entry: [] }).catch((err: unknown) => err);

    expect(rejection).toBeInstanceOf(QueueUnavailableError);
    expect((rejection as QueueUnavailableError).cause).toBe(originalError);
  });

  it("wraps a different DAO rejection too — proves the wrapping is generic, not hardcoded to one message", async () => {
    const originalError = new Error("ETIMEDOUT");
    const add = vi.fn().mockRejectedValue(originalError);
    const service = createWebhookIngestionService({ queue: fakeQueue(add) });

    const rejection = await service.ingest({ entry: [{ id: "x" }] }).catch((err: unknown) => err);

    expect(rejection).toBeInstanceOf(QueueUnavailableError);
    expect((rejection as QueueUnavailableError).cause).toBe(originalError);
  });
});
