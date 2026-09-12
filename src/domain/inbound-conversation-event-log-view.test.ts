import { describe, expect, it } from "vitest";
import { toLogView } from "./inbound-conversation-event-log-view.js";
import type { InboundConversationEvent } from "./inbound-conversation-event.js";

const SECRET = "test-log-hash-secret";

function baseEvent(overrides: Partial<InboundConversationEvent> = {}): InboundConversationEvent {
  return {
    eventId: "wamid.abc123",
    receivedAt: "2026-01-01T00:00:00.000Z",
    source: "whatsapp",
    messageType: "text",
    waPhoneNumberId: "1234567890",
    from: "51999999999",
    contactName: "Juan Perez",
    text: "Hola, quiero una cita en el hospital",
    sentAt: "2026-01-01T00:00:00.000Z",
    raw: { entry: [{ id: "1" }] },
    ...overrides,
  };
}

// D7: pseudonymous metadata goes to the log stream; identifying content
// lives only in the queue/DB behind access control. This is health-adjacent
// personal data (MINSA appointment flow) — treat these tests as the control,
// not a formality.
describe("toLogView", () => {
  it("omits from, text, contactName, and raw entirely — not just as undefined-valued keys", () => {
    const dto = toLogView(baseEvent(), { logHashSecret: SECRET });
    const keys = Object.keys(dto);

    expect(keys).not.toContain("from");
    expect(keys).not.toContain("text");
    expect(keys).not.toContain("contactName");
    expect(keys).not.toContain("raw");
  });

  it("never contains the MSISDN or the message body anywhere in the serialized output", () => {
    const event = baseEvent();
    const dto = toLogView(event, { logHashSecret: SECRET });
    const serialized = JSON.stringify(dto);

    expect(serialized).not.toContain(event.from as string);
    expect(serialized).not.toContain(event.text as string);
  });

  it("produces a stable fromFingerprint for the same MSISDN", () => {
    const dtoA = toLogView(baseEvent({ from: "51999999999" }), { logHashSecret: SECRET });
    const dtoB = toLogView(baseEvent({ from: "51999999999" }), { logHashSecret: SECRET });

    expect(dtoA.fromFingerprint).toBeDefined();
    expect(dtoA.fromFingerprint).toBe(dtoB.fromFingerprint);
  });

  it("produces a different fromFingerprint for a different MSISDN", () => {
    const dtoA = toLogView(baseEvent({ from: "51999999999" }), { logHashSecret: SECRET });
    const dtoB = toLogView(baseEvent({ from: "51988888888" }), { logHashSecret: SECRET });

    expect(dtoA.fromFingerprint).not.toBe(dtoB.fromFingerprint);
  });

  it("fromFingerprint contains no substring of the MSISDN", () => {
    const from = "51999999999";
    const dto = toLogView(baseEvent({ from }), { logHashSecret: SECRET });

    expect(dto.fromFingerprint).toBeDefined();
    for (let i = 0; i <= from.length - 4; i++) {
      expect(dto.fromFingerprint).not.toContain(from.slice(i, i + 4));
    }
  });

  it("textLength matches the message body's length", () => {
    const dto = toLogView(baseEvent({ text: "Hola" }), { logHashSecret: SECRET });
    expect(dto.textLength).toBe(4);
  });

  it("leaves fromFingerprint and textLength undefined when from/text are absent (e.g. a status callback)", () => {
    const dto = toLogView(baseEvent({ from: undefined, text: undefined }), { logHashSecret: SECRET });
    expect(dto.fromFingerprint).toBeUndefined();
    expect(dto.textLength).toBeUndefined();
  });

  it("passes through eventId, receivedAt, source, messageType, waPhoneNumberId, sentAt verbatim", () => {
    const event = baseEvent();
    const dto = toLogView(event, { logHashSecret: SECRET });

    expect(dto.eventId).toBe(event.eventId);
    expect(dto.receivedAt).toBe(event.receivedAt);
    expect(dto.source).toBe(event.source);
    expect(dto.messageType).toBe(event.messageType);
    expect(dto.waPhoneNumberId).toBe(event.waPhoneNumberId);
    expect(dto.sentAt).toBe(event.sentAt);
  });
});
