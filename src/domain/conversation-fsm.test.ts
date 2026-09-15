import { describe, expect, it } from "vitest";
import { STATE_HANDLERS, handle } from "./conversation-fsm.js";
import { createSession } from "./conversation-session.js";
import type { InboundConversationEvent } from "./inbound-conversation-event.js";

const TTL_SECONDS = 3600;

function makeEvent(overrides: Partial<InboundConversationEvent> = {}): InboundConversationEvent {
  return {
    eventId: "wamid.fixed-1",
    receivedAt: "2026-01-01T00:00:00.000Z",
    source: "whatsapp",
    from: "digest-does-not-matter-here",
    messageType: "text",
    raw: {},
    ...overrides,
  };
}

describe("handle — determinism", () => {
  it("returns identical results for identical (session, event) inputs on the unmatched (re-prompt) path", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event = makeEvent({ text: "no entiendo" });

    const first = handle(session, event);
    const second = handle(session, event);

    expect(first).toEqual(second);
  });
});

describe("handle — main_menu", () => {
  it("emits a send_interactive_list effect with the agendar_cita and registrar_reclamo rows on an unmatched inbound event", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event = makeEvent({ text: "hola" });

    const result = handle(session, event);

    expect(result.effects).toHaveLength(1);
    const effect = result.effects[0];
    if (effect.kind !== "send_interactive_list") throw new Error("expected send_interactive_list effect");
    expect(effect.to).toBe("digest-does-not-matter-here");
    const rowIds = effect.sections.flatMap((section) => section.rows.map((row) => row.id));
    expect(rowIds).toEqual(["agendar_cita", "registrar_reclamo"]);
  });

  it("records the selection and advances to awaiting_flow_start when the user selects agendar_cita, without referencing Reclamo/Cita logic", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event = makeEvent({ text: "agendar_cita" });

    const result = handle(session, event);

    expect(result.session.state).toBe("awaiting_flow_start");
    expect(result.session.slots.menuChoice).toBe("agendar_cita");
    expect(result.effects).toEqual([]);
    expect(result.outcome).toBe("continue");
  });

  it("records the selection and advances to awaiting_flow_start when the user selects registrar_reclamo", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event = makeEvent({ text: "registrar_reclamo" });

    const result = handle(session, event);

    expect(result.session.state).toBe("awaiting_flow_start");
    expect(result.session.slots.menuChoice).toBe("registrar_reclamo");
  });

  it("re-prompts and increments invalidAttempts on an unrecognized event, leaving state unchanged", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event = makeEvent({ text: "algo que no coincide" });

    const result = handle(session, event);

    expect(result.session.state).toBe(session.state);
    expect(result.session.counters.invalidAttempts).toBe(1);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].kind).toBe("send_interactive_list");
  });

  it("increments invalidAttempts cumulatively across repeated unmatched events", () => {
    let session = createSession("session-key-1", TTL_SECONDS);

    session = handle(session, makeEvent({ text: "??" })).session;
    session = handle(session, makeEvent({ text: "???" })).session;

    expect(session.counters.invalidAttempts).toBe(2);
  });
});

describe("handle — STATE_HANDLERS registry fallback (D13)", () => {
  it("falls back to the main_menu handler for an unregistered state", () => {
    const session = { ...createSession("session-key-1", TTL_SECONDS), state: "some_unregistered_state" };
    const event = makeEvent({ text: "hola" });

    expect(STATE_HANDLERS["some_unregistered_state"]).toBeUndefined();

    const result = handle(session, event);

    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].kind).toBe("send_interactive_list");
  });
});
