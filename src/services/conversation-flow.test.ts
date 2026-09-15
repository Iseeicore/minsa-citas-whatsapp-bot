import { describe, expect, it, vi } from "vitest";
import type pino from "pino";
import type { InboundConversationEvent } from "../domain/inbound-conversation-event.js";
import type {
  ButtonMessage,
  InteractiveList,
  WhatsappOutboundSender,
} from "../ports/whatsapp-outbound-sender.js";
import { createMemorySessionStore } from "../adapters/memory-session-store.js";
import { msisdnDigest } from "../domain/msisdn-fingerprint.js";
import { TransientFailureError } from "../domain/errors.js";
import { createConversationFlowService } from "./conversation-flow.js";

const SESSION_KEY_SECRET = "test-session-key-secret";
const SESSION_TTL_SECONDS = 3600;
const FROM_MSISDN = "51999999999";

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as pino.Logger;
}

function makeEvent(overrides: Partial<InboundConversationEvent> = {}): InboundConversationEvent {
  return {
    eventId: "wamid.fixed-1",
    receivedAt: "2026-01-01T00:00:00.000Z",
    source: "whatsapp",
    from: FROM_MSISDN,
    messageType: "text",
    raw: {},
    ...overrides,
  };
}

interface RecordedSend {
  readonly method: "sendText" | "sendInteractiveList" | "sendButtons";
  readonly to: string;
}

function fakeSender(opts: { failOn?: RecordedSend["method"] } = {}): {
  sender: WhatsappOutboundSender;
  calls: RecordedSend[];
} {
  const calls: RecordedSend[] = [];

  const sender: WhatsappOutboundSender = {
    async sendText(to: string) {
      calls.push({ method: "sendText", to });
      if (opts.failOn === "sendText") throw new TransientFailureError("meta graph api unreachable");
    },
    async sendInteractiveList(to: string, _list: InteractiveList) {
      calls.push({ method: "sendInteractiveList", to });
      if (opts.failOn === "sendInteractiveList") throw new TransientFailureError("meta graph api unreachable");
    },
    async sendButtons(to: string, _buttons: ButtonMessage) {
      calls.push({ method: "sendButtons", to });
      if (opts.failOn === "sendButtons") throw new TransientFailureError("meta graph api unreachable");
    },
  };

  return { sender, calls };
}

function makeService(sender: WhatsappOutboundSender, sessionStore = createMemorySessionStore({ logger: fakeLogger() })) {
  return {
    sessionStore,
    service: createConversationFlowService({
      sessionStore,
      sender,
      config: { sessionKeySecret: SESSION_KEY_SECRET, sessionTtlSeconds: SESSION_TTL_SECONDS },
    }),
  };
}

describe("createConversationFlowService", () => {
  it("derives the session key via msisdnDigest(event.from, sessionKeySecret) and persists a NEW session under it", async () => {
    const { sender } = fakeSender();
    const { sessionStore, service } = makeService(sender);
    const expectedKey = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    await service.process(makeEvent({ text: "hola" }));

    const stored = await sessionStore.load(expectedKey);
    expect(stored).not.toBeNull();
    expect(stored?.sessionKey).toBe(expectedKey);
  });

  it("follows load -> handle -> effects -> counters -> persist: unmatched text sends the menu and counts 1 received + 1 sent", async () => {
    const { sender, calls } = fakeSender();
    const { sessionStore, service } = makeService(sender);
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    await service.process(makeEvent({ text: "no entiendo" }));

    expect(calls).toEqual([{ method: "sendInteractiveList", to: FROM_MSISDN }]);
    const stored = await sessionStore.load(key);
    expect(stored?.counters.messagesReceived).toBe(1);
    expect(stored?.counters.messagesSent).toBe(1);
    expect(stored?.counters.invalidAttempts).toBe(1);
  });

  it("sources the outbound `to` from the event, never from the (empty) session", async () => {
    const { sender, calls } = fakeSender();
    const { service } = makeService(sender);

    await service.process(makeEvent({ from: "51988887777", text: "hola" }));

    expect(calls[0]?.to).toBe("51988887777");
  });

  it("a matched menu selection advances state, persists it, and sends zero effects (no messagesSent increment)", async () => {
    const { sender, calls } = fakeSender();
    const { sessionStore, service } = makeService(sender);
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    await service.process(makeEvent({ interactiveReplyId: "agendar_cita" }));

    expect(calls).toEqual([]);
    const stored = await sessionStore.load(key);
    expect(stored?.state).toBe("awaiting_flow_start");
    expect(stored?.slots.menuChoice).toBe("agendar_cita");
    expect(stored?.counters.messagesReceived).toBe(1);
    expect(stored?.counters.messagesSent).toBe(0);
  });

  it("loads an EXISTING session (by digest) instead of creating a new one, and its counters accumulate", async () => {
    const { sender } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const { service } = makeService(sender, sessionStore);
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    await service.process(makeEvent({ text: "primero" }));
    await service.process(makeEvent({ text: "segundo" }));

    const stored = await sessionStore.load(key);
    expect(stored?.counters.messagesReceived).toBe(2);
    expect(stored?.counters.invalidAttempts).toBe(2);
  });

  it("rethrows when a send effect throws a TransientFailureError (infra failure)", async () => {
    const { sender } = fakeSender({ failOn: "sendInteractiveList" });
    const { service } = makeService(sender);

    await expect(service.process(makeEvent({ text: "hola" }))).rejects.toBeInstanceOf(TransientFailureError);
  });

  it("leaves the prior stored session intact when a send effect fails — never persists the failed turn", async () => {
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    // Seed a session via a first successful turn.
    const { service: firstService } = makeService(fakeSender().sender, sessionStore);
    await firstService.process(makeEvent({ text: "primero" }));
    const priorSession = await sessionStore.load(key);

    // Second turn: sending fails.
    const { sender: failingSender } = fakeSender({ failOn: "sendInteractiveList" });
    const { service: secondService } = makeService(failingSender, sessionStore);
    await expect(secondService.process(makeEvent({ text: "segundo" }))).rejects.toThrow();

    const afterFailure = await sessionStore.load(key);
    expect(afterFailure).toEqual(priorSession);
  });
});
