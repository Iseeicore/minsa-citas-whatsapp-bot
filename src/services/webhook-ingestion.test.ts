import { describe, expect, it, vi } from "vitest";
import type { ConversationEventDao } from "../ports/conversation-event-dao.js";
import { QueueUnavailableError } from "../domain/errors.js";
import { toInboundConversationEvent } from "../domain/inbound-conversation-event.js";
import { createWebhookIngestionService } from "./webhook-ingestion.js";

function fakeDao(save: ReturnType<typeof vi.fn>): ConversationEventDao {
  return { mode: "redis", save, close: vi.fn().mockResolvedValue(undefined) };
}

describe("createWebhookIngestionService", () => {
  it("maps the raw payload to an InboundConversationEvent and delegates it to the DAO's save() (D6)", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const service = createWebhookIngestionService({ dao: fakeDao(save) });
    const rawPayload = {
      entry: [
        {
          changes: [
            {
              value: { messages: [{ id: "wamid.123", type: "text", text: { body: "hola" }, from: "51999999999" }] },
            },
          ],
        },
      ],
    };

    await service.ingest(rawPayload);

    expect(save).toHaveBeenCalledTimes(1);
    const [savedEvent] = save.mock.calls[0] as [ReturnType<typeof toInboundConversationEvent>];
    expect(savedEvent.eventId).toBe("wamid.123");
    expect(savedEvent.messageType).toBe("text");
    expect(savedEvent.from).toBe("51999999999");
    expect(savedEvent.raw).toBe(rawPayload);
  });

  it("maps an unrecognized payload shape too, without throwing — the DAO still receives a well-formed Entity", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const service = createWebhookIngestionService({ dao: fakeDao(save) });

    await expect(service.ingest({ some: "future shape" })).resolves.toBeUndefined();

    expect(save).toHaveBeenCalledTimes(1);
    const [savedEvent] = save.mock.calls[0] as [ReturnType<typeof toInboundConversationEvent>];
    expect(savedEvent.messageType).toBe("unknown");
  });

  it("wraps a DAO rejection in a QueueUnavailableError, preserving the original cause (D9 — the centralized error handler maps this to 503)", async () => {
    const originalError = new Error("queue unreachable");
    const save = vi.fn().mockRejectedValue(originalError);
    const service = createWebhookIngestionService({ dao: fakeDao(save) });

    const rejection = await service.ingest({ entry: [] }).catch((err: unknown) => err);

    expect(rejection).toBeInstanceOf(QueueUnavailableError);
    expect((rejection as QueueUnavailableError).cause).toBe(originalError);
  });

  it("wraps a different DAO rejection too — proves the wrapping is generic, not hardcoded to one message", async () => {
    const originalError = new Error("ETIMEDOUT");
    const save = vi.fn().mockRejectedValue(originalError);
    const service = createWebhookIngestionService({ dao: fakeDao(save) });

    const rejection = await service.ingest({ entry: [{ id: "x" }] }).catch((err: unknown) => err);

    expect(rejection).toBeInstanceOf(QueueUnavailableError);
    expect((rejection as QueueUnavailableError).cause).toBe(originalError);
  });
});
