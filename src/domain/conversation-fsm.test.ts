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

  it("records the selection, advances to awaiting_flow_start, and replies immediately (D23) when the user selects agendar_cita", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event = makeEvent({ text: "agendar_cita" });

    const result = handle(session, event);

    expect(result.session.state).toBe("awaiting_flow_start");
    expect(result.session.slots.menuChoice).toBe("agendar_cita");
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      kind: "send_text",
      to: "digest-does-not-matter-here",
      body: "Estamos preparando la reserva de tu cita. En un momento continuamos.",
    });
    expect(result.outcome).toBe("continue");
  });

  it("records the selection and advances into the Reclamo branch's identity-choice state when the user selects registrar_reclamo", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event = makeEvent({ text: "registrar_reclamo" });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_identity_choice");
    expect(result.session.slots.menuChoice).toBe("registrar_reclamo");
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      kind: "send_buttons",
      to: "digest-does-not-matter-here",
      body: "¿Deseas identificarte con tu DNI?",
      buttons: [
        { id: "reclamo_con_dni", title: "Sí, tengo DNI" },
        { id: "reclamo_sin_dni", title: "No tengo DNI" },
      ],
    });
    expect(result.outcome).toBe("continue");
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

describe("handle — main_menu, real WhatsApp interactive reply (task 6.8)", () => {
  it("records the selection from a real interactive list_reply id, even when text is absent, and replies immediately (D23)", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event = makeEvent({ interactiveReplyId: "agendar_cita" });

    const result = handle(session, event);

    expect(result.session.state).toBe("awaiting_flow_start");
    expect(result.session.slots.menuChoice).toBe("agendar_cita");
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      kind: "send_text",
      to: "digest-does-not-matter-here",
      body: "Estamos preparando la reserva de tu cita. En un momento continuamos.",
    });
  });

  it("prefers interactiveReplyId over text when both are present", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event = makeEvent({ interactiveReplyId: "registrar_reclamo", text: "algo que no coincide" });

    const result = handle(session, event);

    expect(result.session.slots.menuChoice).toBe("registrar_reclamo");
  });

  it("re-prompts on an unmatched interactiveReplyId, same as an unmatched text", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event = makeEvent({ interactiveReplyId: "some_other_row_id" });

    const result = handle(session, event);

    expect(result.session.state).toBe(session.state);
    expect(result.session.counters.invalidAttempts).toBe(1);
  });
});

describe("handle — awaiting_flow_start (Phase 2 real Reclamo/Cita branch)", () => {
  it("keeps the Cita placeholder (Stage C stub) unchanged, parked in awaiting_flow_start", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event = makeEvent({ text: "agendar_cita" });

    const result = handle(session, event);

    expect(result.session.state).toBe("awaiting_flow_start");
    expect(result.effects).toEqual([
      {
        kind: "send_text",
        to: "digest-does-not-matter-here",
        body: "Estamos preparando la reserva de tu cita. En un momento continuamos.",
      },
    ]);
  });

  it("re-prompts with the main menu, never crashes, on an unset/unrecognized menuChoice (defensive — mainMenuHandler never sets anything else)", () => {
    const parked = { ...createSession("session-key-1", TTL_SECONDS), state: "awaiting_flow_start" };
    const event = makeEvent({ text: "cualquier cosa" });

    const result = handle(parked, event);

    expect(result.session.state).toBe("awaiting_flow_start");
    expect(result.session.counters.invalidAttempts).toBe(1);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].kind).toBe("send_interactive_list");
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
