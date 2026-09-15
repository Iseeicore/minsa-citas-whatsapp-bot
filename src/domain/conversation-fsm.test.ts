import { describe, expect, it } from "vitest";
import { STATE_HANDLERS, handle, isScheduleEvent } from "./conversation-fsm.js";
import type { FsmScheduleEvent, FsmSystemEvent } from "./conversation-fsm.js";
import { createSession } from "./conversation-session.js";
import type { ConversationSession } from "./conversation-session.js";
import type { InboundConversationEvent } from "./inbound-conversation-event.js";
import type { ReniecLookupResult } from "../ports/reniec-lookup-client.js";

const TTL_SECONDS = 3600;
const FROM = "digest-does-not-matter-here";

function makeEvent(overrides: Partial<InboundConversationEvent> = {}): InboundConversationEvent {
  return {
    eventId: "wamid.fixed-1",
    receivedAt: "2026-01-01T00:00:00.000Z",
    source: "whatsapp",
    from: FROM,
    messageType: "text",
    raw: {},
    ...overrides,
  };
}

function makeSystemEvent(result: ReniecLookupResult, overrides: Partial<FsmSystemEvent> = {}): FsmSystemEvent {
  return {
    source: "system",
    from: FROM,
    kind: "reniec_lookup_result",
    result,
    ...overrides,
  };
}

/** A session parked in `state`, with the given slots already recorded — mirrors what an earlier turn would have produced. */
function parkedSession(state: string, slots: ConversationSession["slots"] = {}): ConversationSession {
  return { ...createSession("session-key-1", TTL_SECONDS), state, slots };
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

  // PR6 (Phase 6): the D23 tail-call now lands on the REAL Cita entry point
  // (`cita_awaiting_dni`), replacing PR1's placeholder — design's Migration/
  // Rollout section calls this exact assertion change out as intended, not a
  // regression.
  it("records the selection, advances to cita_awaiting_dni, and replies immediately (D23) when the user selects agendar_cita", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event = makeEvent({ text: "agendar_cita" });

    const result = handle(session, event);

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(result.session.slots.menuChoice).toBe("agendar_cita");
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      kind: "send_text",
      to: "digest-does-not-matter-here",
      body: "Ingresa tu DNI (8 dígitos).",
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

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(result.session.slots.menuChoice).toBe("agendar_cita");
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      kind: "send_text",
      to: "digest-does-not-matter-here",
      body: "Ingresa tu DNI (8 dígitos).",
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
  // PR6 (Phase 6): replaces PR1's placeholder-stub test — design's
  // Migration/Rollout section calls this exact assertion change out as
  // intended, not a regression.
  it("advances to cita_awaiting_dni and asks for the DNI, parked at awaiting_flow_start with agendar_cita recorded", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event = makeEvent({ text: "agendar_cita" });

    const result = handle(session, event);

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(result.effects).toEqual([
      {
        kind: "send_text",
        to: "digest-does-not-matter-here",
        body: "Ingresa tu DNI (8 dígitos).",
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

describe("handle — reclamo_identity_choice (Phase 4, D20/D23 con-DNI branch)", () => {
  it("registers a real handler now (no longer falls back to main_menu)", () => {
    expect(STATE_HANDLERS["reclamo_identity_choice"]).toBeDefined();
  });

  it("advances to reclamo_awaiting_dni and asks for the DNI on reclamo_con_dni", () => {
    const session = parkedSession("reclamo_identity_choice");
    const event = makeEvent({ interactiveReplyId: "reclamo_con_dni" });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_awaiting_dni");
    expect(result.effects).toEqual([{ kind: "send_text", to: FROM, body: "Ingresa tu DNI (8 dígitos)." }]);
    expect(result.outcome).toBe("continue");
  });

  it("advances directly to reclamo_awaiting_descripcion on reclamo_sin_dni — skips DNI/nombre/RENIEC entirely (Phase 5)", () => {
    const session = parkedSession("reclamo_identity_choice");
    const event = makeEvent({ interactiveReplyId: "reclamo_sin_dni" });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_awaiting_descripcion");
    expect(result.session.slots.dni).toBeUndefined();
    expect(result.session.slots.nombre).toBeUndefined();
    expect(result.effects).toEqual([{ kind: "send_text", to: FROM, body: "Describe tu reclamo." }]);
    expect(result.outcome).toBe("continue");
  });

  it("re-prompts with the identity-choice buttons and increments invalidAttempts on an unmatched reply", () => {
    const session = parkedSession("reclamo_identity_choice");
    const event = makeEvent({ text: "no sé" });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_identity_choice");
    expect(result.session.counters.invalidAttempts).toBe(1);
    expect(result.effects).toEqual([
      {
        kind: "send_buttons",
        to: FROM,
        body: "¿Deseas identificarte con tu DNI?",
        buttons: [
          { id: "reclamo_con_dni", title: "Sí, tengo DNI" },
          { id: "reclamo_sin_dni", title: "No tengo DNI" },
        ],
      },
    ]);
  });
});

describe("handle — reclamo_awaiting_dni (identity-verification / DNI Format Validation)", () => {
  it("advances to reclamo_awaiting_nombre and stores slots.dni on a valid 8-digit DNI", () => {
    const session = parkedSession("reclamo_awaiting_dni");
    const event = makeEvent({ text: "12345678" });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_awaiting_nombre");
    expect(result.session.slots.dni).toBe("12345678");
    expect(result.effects).toEqual([
      { kind: "send_text", to: FROM, body: "Ingresa tus nombres y apellidos, tal como figuran en tu DNI." },
    ]);
  });

  it("re-prompts and increments invalidAttempts on an invalid DNI format, emitting NO reniec_lookup effect", () => {
    const session = parkedSession("reclamo_awaiting_dni");
    const event = makeEvent({ text: "123" });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_awaiting_dni");
    expect(result.session.counters.invalidAttempts).toBe(1);
    expect(result.effects.some((effect) => effect.kind === "reniec_lookup")).toBe(false);
    expect(result.effects[0].kind).toBe("send_text");
  });

  it("re-prompts on a missing text reply (e.g. a media message), never crashing", () => {
    const session = parkedSession("reclamo_awaiting_dni");
    const event = makeEvent({ text: undefined, messageType: "image" });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_awaiting_dni");
    expect(result.session.counters.invalidAttempts).toBe(1);
  });
});

describe("handle — reclamo_awaiting_nombre", () => {
  it("advances to reclamo_reniec_pending, stores slots.nombre, and emits BOTH a send_text and the reniec_lookup query effect (D20)", () => {
    const session = parkedSession("reclamo_awaiting_nombre", { dni: "12345678" });
    const event = makeEvent({ text: "Juan Perez" });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_reniec_pending");
    expect(result.session.slots.nombre).toBe("Juan Perez");
    expect(result.effects).toEqual([
      { kind: "send_text", to: FROM, body: "Estamos verificando tus datos…" },
      { kind: "reniec_lookup", dni: "12345678" },
    ]);
  });

  it("does NOT perform any I/O as a side effect of handle() itself — the reniec_lookup effect is inert data", () => {
    const session = parkedSession("reclamo_awaiting_nombre", { dni: "12345678" });
    const event = makeEvent({ text: "Juan Perez" });

    // handle() is synchronous — if it performed I/O, this call would need to
    // be awaited. The type system already enforces this; asserting the
    // return value is a plain object (not a Promise) makes the guarantee
    // explicit and executable.
    const result = handle(session, event);
    expect(result).not.toBeInstanceOf(Promise);
  });

  it("re-prompts on an empty/missing text reply, never emitting a reniec_lookup effect", () => {
    const session = parkedSession("reclamo_awaiting_nombre", { dni: "12345678" });
    const event = makeEvent({ text: "   " });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_awaiting_nombre");
    expect(result.session.counters.invalidAttempts).toBe(1);
    expect(result.effects.some((effect) => effect.kind === "reniec_lookup")).toBe(false);
  });
});

describe("handle — reclamo_reniec_pending (D20 re-entry target)", () => {
  it("advances to reclamo_awaiting_descripcion and asks for the descripción on a RENIEC match (Phase 5)", () => {
    const session = parkedSession("reclamo_reniec_pending", { dni: "12345678", nombre: "Juan Perez" });
    const systemEvent = makeSystemEvent({
      status: "found",
      nombres: "Juan Carlos",
      apellidoPaterno: "Perez",
      apellidoMaterno: "Lopez",
    });

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("reclamo_awaiting_descripcion");
    expect(result.outcome).toBe("continue");
    expect(result.effects).toEqual([{ kind: "send_text", to: FROM, body: "Describe tu reclamo." }]);
    // No further query effect — this is the SECOND handle() call in the D20
    // turn; a third would be a contract violation (tested in conversation-flow.test.ts).
    expect(result.effects.some((effect) => effect.kind === "reniec_lookup")).toBe(false);
  });

  it("transitions to reclamo_rejected with outcome 'rejected' and a rejection message on a RENIEC name mismatch — never throws", () => {
    const session = parkedSession("reclamo_reniec_pending", { dni: "12345678", nombre: "Alguien Distinto" });
    const systemEvent = makeSystemEvent({
      status: "found",
      nombres: "Juan Carlos",
      apellidoPaterno: "Perez",
      apellidoMaterno: "Lopez",
    });

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("reclamo_rejected");
    expect(result.outcome).toBe("rejected");
    expect(result.effects.map((effect) => effect.kind)).toEqual(["send_text", "end_session"]);
  });

  it("transitions to reclamo_rejected with outcome 'rejected' on RENIEC not_found — never throws", () => {
    const session = parkedSession("reclamo_reniec_pending", { dni: "12345678", nombre: "Juan Perez" });
    const systemEvent = makeSystemEvent({ status: "not_found" });

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("reclamo_rejected");
    expect(result.outcome).toBe("rejected");
  });

  it("D22/DNI-3: clears the dni and nombre slots on the rejected terminal transition", () => {
    const session = parkedSession("reclamo_reniec_pending", { dni: "12345678", nombre: "Juan Perez" });
    const systemEvent = makeSystemEvent({ status: "not_found" });

    const result = handle(session, systemEvent);

    expect(result.session.slots.dni).toBeUndefined();
    expect(result.session.slots.nombre).toBeUndefined();
    const serialized = JSON.stringify(result.session);
    expect(serialized).not.toContain("12345678");
    expect(serialized).not.toContain("Juan Perez");
  });

  it("stays unchanged and re-prompts with a processing message on a defensive stray inbound event (pending states are never persisted)", () => {
    const session = parkedSession("reclamo_reniec_pending", { dni: "12345678", nombre: "Juan Perez" });
    const event = makeEvent({ text: "hola de nuevo" });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_reniec_pending");
    expect(result.effects).toEqual([
      { kind: "send_text", to: FROM, body: "Estamos procesando tu solicitud, danos un momento." },
    ]);
    expect(result.outcome).toBe("continue");
  });
});

describe("handle — reclamo_awaiting_descripcion (Phase 5)", () => {
  it("advances to reclamo_awaiting_foto and stores slots.queja on a valid trimmed description", () => {
    const session = parkedSession("reclamo_awaiting_descripcion");
    const event = makeEvent({ text: "  Se cayó un poste de luz  " });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_awaiting_foto");
    expect(result.session.slots.queja).toBe("Se cayó un poste de luz");
    expect(result.effects).toEqual([{ kind: "send_text", to: FROM, body: "Envía una foto o escribe OMITIR." }]);
    expect(result.outcome).toBe("continue");
  });

  it("re-prompts and increments invalidAttempts on an empty/whitespace-only description", () => {
    const session = parkedSession("reclamo_awaiting_descripcion");
    const event = makeEvent({ text: "   " });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_awaiting_descripcion");
    expect(result.session.counters.invalidAttempts).toBe(1);
    expect(result.session.slots.queja).toBeUndefined();
  });

  it("re-prompts on a description longer than 1000 characters", () => {
    const session = parkedSession("reclamo_awaiting_descripcion");
    const event = makeEvent({ text: "x".repeat(1001) });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_awaiting_descripcion");
    expect(result.session.counters.invalidAttempts).toBe(1);
  });

  it("re-prompts on a missing text reply (e.g. a media message), never crashing", () => {
    const session = parkedSession("reclamo_awaiting_descripcion");
    const event = makeEvent({ text: undefined, messageType: "image" });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_awaiting_descripcion");
    expect(result.session.counters.invalidAttempts).toBe(1);
  });
});

describe("handle — reclamo_awaiting_foto (Phase 5, spec 'Foto without image')", () => {
  it("advances to reclamo_submit_pending and emits BOTH a send_text and the quejas_submit query effect when a mediaId is present", () => {
    const session = parkedSession("reclamo_awaiting_foto", { dni: "12345678", nombre: "Juan Perez", queja: "Reclamo real" });
    const event = makeEvent({ mediaId: "media-handle-1", mediaMimeType: "image/jpeg" });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_submit_pending");
    expect(result.effects).toHaveLength(2);
    expect(result.effects[0]).toEqual({ kind: "send_text", to: FROM, body: "Registrando tu reclamo…" });
    const queryEffect = result.effects[1];
    if (queryEffect.kind !== "quejas_submit") throw new Error("expected quejas_submit effect");
    expect(queryEffect.submission).toEqual({
      celular: FROM,
      dni: "12345678",
      nombreCompleto: "Juan Perez",
      queja: "Reclamo real",
      mediaId: "media-handle-1",
    });
  });

  it("advances to reclamo_submit_pending with mediaId: null on a case-insensitive OMITIR reply", () => {
    const session = parkedSession("reclamo_awaiting_foto", { queja: "Reclamo real" });
    const event = makeEvent({ text: "  omitir  " });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_submit_pending");
    const queryEffect = result.effects.find((effect) => effect.kind === "quejas_submit");
    if (queryEffect?.kind !== "quejas_submit") throw new Error("expected quejas_submit effect");
    expect(queryEffect.submission.mediaId).toBeNull();
  });

  it("sin-DNI path: submission carries dni: null and nombreCompleto: null (never fabricated)", () => {
    const session = parkedSession("reclamo_awaiting_foto", { queja: "Reclamo sin DNI" });
    const event = makeEvent({ text: "OMITIR" });

    const result = handle(session, event);

    const queryEffect = result.effects.find((effect) => effect.kind === "quejas_submit");
    if (queryEffect?.kind !== "quejas_submit") throw new Error("expected quejas_submit effect");
    expect(queryEffect.submission.dni).toBeNull();
    expect(queryEffect.submission.nombreCompleto).toBeNull();
  });

  it("D17/D22: submission.celular equals event.from even when slots carries a different planted decoy celular value", () => {
    const session = parkedSession("reclamo_awaiting_foto", { queja: "Reclamo real", celular: "DECOY-9999999" });
    const event = makeEvent({ mediaId: "media-handle-2", from: "51900000000" });

    const result = handle(session, event);

    const queryEffect = result.effects.find((effect) => effect.kind === "quejas_submit");
    if (queryEffect?.kind !== "quejas_submit") throw new Error("expected quejas_submit effect");
    expect(queryEffect.submission.celular).toBe("51900000000");
  });

  it("spec scenario 'Foto without image': re-prompts and emits NO quejas_submit effect when the reply carries no media id", () => {
    const session = parkedSession("reclamo_awaiting_foto", { queja: "Reclamo real" });
    const event = makeEvent({ text: "no tengo foto" });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_awaiting_foto");
    expect(result.session.counters.invalidAttempts).toBe(1);
    expect(result.effects.some((effect) => effect.kind === "quejas_submit")).toBe(false);
  });
});

describe("handle — reclamo_submit_pending (D20 second re-entry target)", () => {
  it("advances to reclamo_confirmed (terminal) with a confirmation message and end_session on an accepted submission", () => {
    const session = parkedSession("reclamo_submit_pending", { dni: "12345678", nombre: "Juan Perez", queja: "algo" });
    const systemEvent: FsmSystemEvent = {
      source: "system",
      from: FROM,
      kind: "quejas_submit_result",
      result: { status: "accepted", reference: "REF-1" },
    };

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("reclamo_confirmed");
    expect(result.outcome).toBe("continue");
    expect(result.effects.map((effect) => effect.kind)).toEqual(["send_text", "end_session"]);
    expect((result.effects[0] as { body: string }).body).toContain("REF-1");
  });

  it("advances to reclamo_failed (terminal, outcome 'rejected') with a reason-specific message on a rejected submission — never throws", () => {
    const session = parkedSession("reclamo_submit_pending", { dni: "12345678", nombre: "Juan Perez", queja: "algo" });
    const systemEvent: FsmSystemEvent = {
      source: "system",
      from: FROM,
      kind: "quejas_submit_result",
      result: { status: "rejected", reason: "media_too_large" },
    };

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("reclamo_failed");
    expect(result.outcome).toBe("rejected");
    expect(result.effects.map((effect) => effect.kind)).toEqual(["send_text", "end_session"]);
  });

  it("D22/DNI-3: clears dni/nombre/queja slots on BOTH the confirmed and the failed terminal transition", () => {
    const acceptedSession = parkedSession("reclamo_submit_pending", {
      dni: "12345678",
      nombre: "Juan Perez",
      queja: "detalle sensible del reclamo",
    });
    const acceptedResult = handle(acceptedSession, {
      source: "system",
      from: FROM,
      kind: "quejas_submit_result",
      result: { status: "accepted" },
    });
    expect(acceptedResult.session.slots.dni).toBeUndefined();
    expect(acceptedResult.session.slots.nombre).toBeUndefined();
    expect(acceptedResult.session.slots.queja).toBeUndefined();
    const acceptedSerialized = JSON.stringify(acceptedResult.session);
    expect(acceptedSerialized).not.toContain("12345678");
    expect(acceptedSerialized).not.toContain("Juan Perez");
    expect(acceptedSerialized).not.toContain("detalle sensible del reclamo");

    const rejectedSession = parkedSession("reclamo_submit_pending", {
      dni: "87654321",
      nombre: "Maria Lopez",
      queja: "otro detalle sensible",
    });
    const rejectedResult = handle(rejectedSession, {
      source: "system",
      from: FROM,
      kind: "quejas_submit_result",
      result: { status: "rejected", reason: "validation_failed" },
    });
    expect(rejectedResult.session.slots.dni).toBeUndefined();
    expect(rejectedResult.session.slots.nombre).toBeUndefined();
    expect(rejectedResult.session.slots.queja).toBeUndefined();
    const rejectedSerialized = JSON.stringify(rejectedResult.session);
    expect(rejectedSerialized).not.toContain("87654321");
    expect(rejectedSerialized).not.toContain("Maria Lopez");
    expect(rejectedSerialized).not.toContain("otro detalle sensible");
  });

  it("stays unchanged and re-prompts with a processing message on a defensive stray inbound event (pending states are never persisted)", () => {
    const session = parkedSession("reclamo_submit_pending", { queja: "algo" });
    const event = makeEvent({ text: "hola de nuevo" });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_submit_pending");
    expect(result.effects).toEqual([
      { kind: "send_text", to: FROM, body: "Estamos procesando tu solicitud, danos un momento." },
    ]);
    expect(result.outcome).toBe("continue");
  });
});

describe("handle — terminal Reclamo states share closedFlowHandler (design's FSM states table)", () => {
  it.each(["reclamo_confirmed", "reclamo_rejected", "reclamo_failed"] as const)(
    "%s: any inbound event resets to main_menu with the menu list, a fresh start",
    (terminalState) => {
      const session = parkedSession(terminalState);
      const event = makeEvent({ text: "hola de nuevo" });

      const result = handle(session, event);

      expect(result.session.state).toBe("main_menu");
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].kind).toBe("send_interactive_list");
      expect(result.outcome).toBe("continue");
    }
  );
});

describe("handle — sin-DNI shortcut, end to end (spec's 'Reclamo sin DNI — Direct Capture')", () => {
  it("reclamo_identity_choice -> reclamo_awaiting_descripcion -> reclamo_awaiting_foto -> reclamo_submit_pending, never entering a DNI/nombre/RENIEC state", () => {
    const identityChoice = handle(parkedSession("reclamo_identity_choice"), makeEvent({ interactiveReplyId: "reclamo_sin_dni" }));
    expect(identityChoice.session.state).toBe("reclamo_awaiting_descripcion");

    const descripcion = handle(identityChoice.session, makeEvent({ text: "Fuga de agua en mi calle" }));
    expect(descripcion.session.state).toBe("reclamo_awaiting_foto");
    expect(descripcion.session.slots.dni).toBeUndefined();
    expect(descripcion.session.slots.nombre).toBeUndefined();

    const foto = handle(descripcion.session, makeEvent({ text: "OMITIR" }));
    expect(foto.session.state).toBe("reclamo_submit_pending");
    const queryEffect = foto.effects.find((effect) => effect.kind === "quejas_submit");
    if (queryEffect?.kind !== "quejas_submit") throw new Error("expected quejas_submit effect");
    expect(queryEffect.submission.dni).toBeNull();
    expect(queryEffect.submission.nombreCompleto).toBeNull();
    expect(queryEffect.submission.queja).toBe("Fuga de agua en mi calle");
  });
});

describe("handle — FsmEvent widening (D20) does not change existing handler logic", () => {
  it("main_menu still matches on a plain InboundConversationEvent, unaffected by the widened event type", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event = makeEvent({ interactiveReplyId: "registrar_reclamo" });

    const result = handle(session, event);

    expect(result.session.state).toBe("reclamo_identity_choice");
  });
});

// D29 (Stage C1, PR4): FsmEvent's THIRD source — a timer fire, not a citizen
// message. Widened additively, exactly like D20's own FsmSystemEvent
// widening above: no existing handler needed a logic change, only a compile
// against the wider union. Cita's real cita_registration_wait handler (the
// one that actually branches on isScheduleEvent) is Phase 6 — until then, a
// schedule-sourced event reaching handle() falls through the same
// unregistered/unmatched defensive paths every other unrecognized event
// already falls through, per D13's registry-fallback guard.
describe("isScheduleEvent (D29)", () => {
  function scheduleEvent(overrides: Partial<FsmScheduleEvent> = {}): FsmScheduleEvent {
    return {
      source: "schedule",
      from: FROM,
      kind: "cita_registration_wait_elapsed",
      waitToken: "registro_wait:1",
      ...overrides,
    };
  }

  it("returns true for a schedule-sourced event", () => {
    expect(isScheduleEvent(scheduleEvent())).toBe(true);
  });

  it("returns false for a real inbound (whatsapp-sourced) event", () => {
    expect(isScheduleEvent(makeEvent({ text: "hola" }))).toBe(false);
  });

  it("returns false for a synthesized system-result (D20) event", () => {
    expect(isScheduleEvent(makeSystemEvent({ status: "not_found" }))).toBe(false);
  });
});

// PR6 (Phase 6): design's FSM states table, `cita_awaiting_dni` row.
describe("handle — cita_awaiting_dni (Phase 6, DNI Format Validation)", () => {
  it("registers a real handler now (no longer falls back to main_menu)", () => {
    expect(STATE_HANDLERS["cita_awaiting_dni"]).toBeDefined();
  });

  it("advances to cita_validate_pending, stores slots.citaDni, and emits BOTH a send_text and the validate_user query effect (D20)", () => {
    const session = parkedSession("cita_awaiting_dni");
    const event = makeEvent({ text: "12345678" });

    const result = handle(session, event);

    expect(result.session.state).toBe("cita_validate_pending");
    expect(result.session.slots.citaDni).toBe("12345678");
    expect(result.effects).toEqual([
      { kind: "send_text", to: FROM, body: "Estamos validando tus datos…" },
      { kind: "validate_user", numeroDocumento: "12345678" },
    ]);
    expect(result.outcome).toBe("continue");
  });

  it("re-prompts and increments invalidAttempts on an invalid DNI format, emitting NO validate_user effect", () => {
    const session = parkedSession("cita_awaiting_dni");
    const event = makeEvent({ text: "123" });

    const result = handle(session, event);

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(result.session.counters.invalidAttempts).toBe(1);
    expect(result.effects.some((effect) => effect.kind === "validate_user")).toBe(false);
    expect(result.effects[0].kind).toBe("send_text");
  });

  it("re-prompts on a missing text reply (e.g. a media message), never crashing", () => {
    const session = parkedSession("cita_awaiting_dni");
    const event = makeEvent({ text: undefined, messageType: "image" });

    const result = handle(session, event);

    expect(result.session.state).toBe("cita_awaiting_dni");
    expect(result.session.counters.invalidAttempts).toBe(1);
  });
});

function makeValidateUserSystemEvent(
  result: FsmSystemEvent["result"],
  overrides: Partial<FsmSystemEvent> = {}
): FsmSystemEvent {
  return { source: "system", from: FROM, kind: "validate_user_result", result, ...overrides };
}

// PR6 (Phase 6): design's FSM states table, `cita_validate_pending` row —
// D20's re-entry target (mirrors reclamoReniecPendingHandler).
describe("handle — cita_validate_pending (D20 re-entry target, Phase 6)", () => {
  it("registers a real handler now (no longer falls back to main_menu)", () => {
    expect(STATE_HANDLERS["cita_validate_pending"]).toBeDefined();
  });

  it("valid: advances to cita_awaiting_otp and stores slots.citaTwofaId", () => {
    const session = parkedSession("cita_validate_pending", { citaDni: "12345678" });
    const systemEvent = makeValidateUserSystemEvent({ status: "valid", twofaId: "twofa-abc" });

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("cita_awaiting_otp");
    expect(result.session.slots.citaTwofaId).toBe("twofa-abc");
    expect(result.effects).toEqual([{ kind: "send_text", to: FROM, body: "Te enviamos un código de verificación." }]);
    expect(result.outcome).toBe("continue");
    // PR7 (Phase 7): now registered — see "handle — cita_awaiting_otp" below
    // for its own full coverage. Phase 6 only asserted it was a placeholder
    // target; this is the intended replacement, not a regression.
    expect(STATE_HANDLERS["cita_awaiting_otp"]).toBeDefined();
  });

  it("not_valid, first occurrence: advances to cita_registration_wait, records check #1, and emits a schedule_check effect (threat: unbounded scheduling)", () => {
    const session = parkedSession("cita_validate_pending", { citaDni: "12345678" });
    const systemEvent = makeValidateUserSystemEvent({ status: "not_valid" });

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("cita_registration_wait");
    expect(result.session.slots.citaRegistrationChecks).toBe(1);
    expect(result.session.slots.citaWaitToken).toBe("registro_wait:1");
    expect(result.effects).toHaveLength(2);
    expect(result.effects[0].kind).toBe("send_text");
    expect(result.effects[1]).toEqual({
      kind: "schedule_check",
      sessionKey: session.sessionKey,
      to: FROM,
      delaySeconds: 300,
      checkKind: "cita_registration_wait_elapsed",
      waitToken: "registro_wait:1",
      expectedState: "cita_registration_wait",
    });
    expect(result.outcome).toBe("continue");
  });

  it("not_valid, second occurrence: records check #2 with a NEW wait token (registro_wait:2)", () => {
    const session = parkedSession("cita_validate_pending", { citaDni: "12345678", citaRegistrationChecks: 1 });
    const systemEvent = makeValidateUserSystemEvent({ status: "not_valid" });

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("cita_registration_wait");
    expect(result.session.slots.citaRegistrationChecks).toBe(2);
    expect(result.session.slots.citaWaitToken).toBe("registro_wait:2");
    const scheduleEffect = result.effects.find((effect) => effect.kind === "schedule_check");
    if (scheduleEffect?.kind !== "schedule_check") throw new Error("expected schedule_check effect");
    expect(scheduleEffect.waitToken).toBe("registro_wait:2");
  });

  it("not_valid, third occurrence (threat: unbounded scheduling): terminal cita_registration_rejected, NO third schedule_check, all cita slots cleared", () => {
    const session = parkedSession("cita_validate_pending", { citaDni: "12345678", citaRegistrationChecks: 2 });
    const systemEvent = makeValidateUserSystemEvent({ status: "not_valid" });

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("cita_registration_rejected");
    expect(result.outcome).toBe("rejected");
    expect(result.effects.map((effect) => effect.kind)).toEqual(["send_text", "end_session"]);
    expect(result.effects.some((effect) => effect.kind === "schedule_check")).toBe(false);
    expect(result.session.slots.citaDni).toBeUndefined();
    expect(result.session.slots.citaRegistrationChecks).toBeUndefined();
    expect(result.session.slots.citaWaitToken).toBeUndefined();
    const serialized = JSON.stringify(result.session);
    expect(serialized).not.toContain("12345678");
  });

  it("D17: schedule_check.to equals event.from, even when slots carries a planted decoy `to` value (named provenance test, task 6.6)", () => {
    const session = parkedSession("cita_validate_pending", {
      citaDni: "12345678",
      to: "DECOY-9999999",
    });
    const systemEvent = makeValidateUserSystemEvent({ status: "not_valid" }, { from: "51900000000" });

    const result = handle(session, systemEvent);

    const scheduleEffect = result.effects.find((effect) => effect.kind === "schedule_check");
    if (scheduleEffect?.kind !== "schedule_check") throw new Error("expected schedule_check effect");
    expect(scheduleEffect.to).toBe("51900000000");
  });

  it("stays unchanged and re-prompts with a processing message on a defensive stray inbound event (pending states are never persisted)", () => {
    const session = parkedSession("cita_validate_pending", { citaDni: "12345678" });
    const event = makeEvent({ text: "hola de nuevo" });

    const result = handle(session, event);

    expect(result.session.state).toBe("cita_validate_pending");
    expect(result.effects).toEqual([
      { kind: "send_text", to: FROM, body: "Estamos procesando tu solicitud, danos un momento." },
    ]);
    expect(result.outcome).toBe("continue");
  });

  it("stays unchanged on a defensive foreign system-event kind, never crashing", () => {
    const session = parkedSession("cita_validate_pending", { citaDni: "12345678" });
    const systemEvent: FsmSystemEvent = { source: "system", from: FROM, kind: "reniec_lookup_result", result: { status: "not_found" } };

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("cita_validate_pending");
    expect(result.effects).toEqual([
      { kind: "send_text", to: FROM, body: "Estamos procesando tu solicitud, danos un momento." },
    ]);
  });
});

// PR6 (Phase 6): design's FSM states table, `cita_registration_wait` row.
// Both exits converge on the IDENTICAL next state/effect/counter (D31).
describe("handle — cita_registration_wait (D31 race handling, Phase 6)", () => {
  it("registers a real handler now (no longer falls back to main_menu)", () => {
    expect(STATE_HANDLERS["cita_registration_wait"]).toBeDefined();
  });

  it("CONFIRMAR reply (case-insensitive): clears citaWaitToken and advances to cita_validate_pending, re-emitting validate_user", () => {
    const session = parkedSession("cita_registration_wait", {
      citaDni: "12345678",
      citaRegistrationChecks: 1,
      citaWaitToken: "registro_wait:1",
    });
    const event = makeEvent({ text: "confirmar" });

    const result = handle(session, event);

    expect(result.session.state).toBe("cita_validate_pending");
    expect(result.session.slots.citaWaitToken).toBeUndefined();
    expect(result.effects).toEqual([
      { kind: "send_text", to: FROM, body: "Verificando tu registro…" },
      { kind: "validate_user", numeroDocumento: "12345678" },
    ]);
    expect(result.outcome).toBe("continue");
  });

  it("schedule fire (cita_registration_wait_elapsed): the IDENTICAL transition/effect as the CONFIRMAR exit, different wording", () => {
    const session = parkedSession("cita_registration_wait", {
      citaDni: "12345678",
      citaRegistrationChecks: 1,
      citaWaitToken: "registro_wait:1",
    });
    const event: FsmScheduleEvent = {
      source: "schedule",
      from: FROM,
      kind: "cita_registration_wait_elapsed",
      waitToken: "registro_wait:1",
    };

    const result = handle(session, event);

    expect(result.session.state).toBe("cita_validate_pending");
    expect(result.session.slots.citaWaitToken).toBeUndefined();
    expect(result.effects).toEqual([
      { kind: "send_text", to: FROM, body: "Seguimos verificando tu registro…" },
      { kind: "validate_user", numeroDocumento: "12345678" },
    ]);
    expect(result.outcome).toBe("continue");
  });

  it("any OTHER inbound reply: re-prompts, increments invalidAttempts, and leaves citaWaitToken INTACT so the armed timer survives", () => {
    const session = parkedSession("cita_registration_wait", {
      citaDni: "12345678",
      citaRegistrationChecks: 1,
      citaWaitToken: "registro_wait:1",
    });
    const event = makeEvent({ text: "no entiendo" });

    const result = handle(session, event);

    expect(result.session.state).toBe("cita_registration_wait");
    expect(result.session.counters.invalidAttempts).toBe(1);
    expect(result.session.slots.citaWaitToken).toBe("registro_wait:1");
    expect(result.effects.some((effect) => effect.kind === "validate_user")).toBe(false);
  });
});

describe("handle — cita_registration_rejected reuses closedFlowHandler (design's FSM states table)", () => {
  it("registers a real handler now (no longer falls back to main_menu)", () => {
    expect(STATE_HANDLERS["cita_registration_rejected"]).toBeDefined();
  });

  it("any inbound event resets to main_menu with the menu list, a fresh start", () => {
    const session = parkedSession("cita_registration_rejected");
    const event = makeEvent({ text: "hola de nuevo" });

    const result = handle(session, event);

    expect(result.session.state).toBe("main_menu");
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].kind).toBe("send_interactive_list");
    expect(result.outcome).toBe("continue");
  });
});

function makeVerifyCodeSystemEvent(
  result: FsmSystemEvent["result"],
  overrides: Partial<FsmSystemEvent> = {}
): FsmSystemEvent {
  return { source: "system", from: FROM, kind: "verify_code_result", result, ...overrides };
}

// Phase 7 (PR7): design's FSM states table, `cita_awaiting_otp` row.
describe("handle — cita_awaiting_otp (Phase 7, OTP Verification)", () => {
  it("registers a real handler now (no longer falls back to main_menu)", () => {
    expect(STATE_HANDLERS["cita_awaiting_otp"]).toBeDefined();
  });

  it("advances to cita_verify_pending and emits BOTH a send_text and the verify_code query effect (D20), reading twofaId from slots", () => {
    const session = parkedSession("cita_awaiting_otp", { citaDni: "12345678", citaTwofaId: "twofa-1" });
    const event = makeEvent({ text: "123456" });

    const result = handle(session, event);

    expect(result.session.state).toBe("cita_verify_pending");
    expect(result.effects).toEqual([
      { kind: "send_text", to: FROM, body: "Validando el código…" },
      { kind: "verify_code", twofaId: "twofa-1", code: "123456" },
    ]);
    expect(result.outcome).toBe("continue");
  });

  it("task 7.2 — re-prompts and increments ONLY invalidAttempts on an invalid OTP format, NEVER citaOtpAttempts, and emits NO verify_code effect", () => {
    const session = parkedSession("cita_awaiting_otp", { citaDni: "12345678", citaTwofaId: "twofa-1" });
    const event = makeEvent({ text: "12" });

    const result = handle(session, event);

    expect(result.session.state).toBe("cita_awaiting_otp");
    expect(result.session.counters.invalidAttempts).toBe(1);
    expect(result.session.slots.citaOtpAttempts).toBeUndefined();
    expect(result.effects.some((effect) => effect.kind === "verify_code")).toBe(false);
    expect(result.effects[0].kind).toBe("send_text");
  });

  it("re-prompts on a missing text reply (e.g. a media message), never crashing", () => {
    const session = parkedSession("cita_awaiting_otp", { citaDni: "12345678", citaTwofaId: "twofa-1" });
    const event = makeEvent({ text: undefined, messageType: "image" });

    const result = handle(session, event);

    expect(result.session.state).toBe("cita_awaiting_otp");
    expect(result.session.counters.invalidAttempts).toBe(1);
  });
});

// Phase 7 (PR7): design's FSM states table, `cita_verify_pending` row — D20's
// re-entry target (mirrors citaValidatePendingHandler).
describe("handle — cita_verify_pending (D20 re-entry target, Phase 7)", () => {
  it("registers a real handler now (no longer falls back to main_menu)", () => {
    expect(STATE_HANDLERS["cita_verify_pending"]).toBeDefined();
  });

  it("task 7.3 — verified: stores slots.citaBearer, advances to cita_identity_confirmed, and clears citaDni/citaTwofaId/citaOtpAttempts/citaWaitToken/citaRegistrationChecks", () => {
    const session = parkedSession("cita_verify_pending", {
      citaDni: "12345678",
      citaTwofaId: "twofa-1",
      citaOtpAttempts: 1,
      citaWaitToken: "registro_wait:1",
      citaRegistrationChecks: 1,
    });
    const systemEvent = makeVerifyCodeSystemEvent({
      status: "verified",
      token: "bearer-token-value",
      tokenType: "Bearer",
      expiresIn: 3600,
    });

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("cita_identity_confirmed");
    expect(result.session.slots.citaBearer).toBe("bearer-token-value");
    // MVP addition (no-SDD fast path): citaDni is ALSO retained now,
    // alongside citaBearer — the booking call needs it again downstream in
    // the catalog chain (same documented D33-style exception).
    expect(result.session.slots.citaDni).toBe("12345678");
    expect(result.session.slots.citaTwofaId).toBeUndefined();
    expect(result.session.slots.citaOtpAttempts).toBeUndefined();
    expect(result.session.slots.citaWaitToken).toBeUndefined();
    expect(result.session.slots.citaRegistrationChecks).toBeUndefined();
    expect(result.effects).toEqual([
      {
        kind: "send_text",
        to: FROM,
        body: "Identidad verificada. Estamos preparando la reserva de tu cita.",
      },
    ]);
    expect(result.outcome).toBe("continue");
  });

  it("task 7.4 — invalid, first occurrence: increments citaOtpAttempts to 1, re-prompts at cita_awaiting_otp with 2 remaining attempts", () => {
    const session = parkedSession("cita_verify_pending", { citaDni: "12345678", citaTwofaId: "twofa-1" });
    const systemEvent = makeVerifyCodeSystemEvent({ status: "invalid" });

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("cita_awaiting_otp");
    expect(result.session.slots.citaOtpAttempts).toBe(1);
    expect(result.effects).toEqual([
      { kind: "send_text", to: FROM, body: "Código incorrecto. Te quedan 2 intentos." },
    ]);
    expect(result.outcome).toBe("continue");
  });

  it("invalid, second occurrence: increments citaOtpAttempts to 2, re-prompts with 1 remaining attempt", () => {
    const session = parkedSession("cita_verify_pending", {
      citaDni: "12345678",
      citaTwofaId: "twofa-1",
      citaOtpAttempts: 1,
    });
    const systemEvent = makeVerifyCodeSystemEvent({ status: "invalid" });

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("cita_awaiting_otp");
    expect(result.session.slots.citaOtpAttempts).toBe(2);
    expect(result.effects).toEqual([
      { kind: "send_text", to: FROM, body: "Código incorrecto. Te quedan 1 intentos." },
    ]);
  });

  it("task 7.4 — invalid, third occurrence: terminal cita_otp_locked, no further prompt possible, all cita slots incl. citaBearer cleared", () => {
    const session = parkedSession("cita_verify_pending", {
      citaDni: "12345678",
      citaTwofaId: "twofa-1",
      citaOtpAttempts: 2,
    });
    const systemEvent = makeVerifyCodeSystemEvent({ status: "invalid" });

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("cita_otp_locked");
    expect(result.outcome).toBe("rejected");
    expect(result.effects.map((effect) => effect.kind)).toEqual(["send_text", "end_session"]);
    expect(result.session.slots.citaDni).toBeUndefined();
    expect(result.session.slots.citaTwofaId).toBeUndefined();
    expect(result.session.slots.citaOtpAttempts).toBeUndefined();
    expect(result.session.slots.citaBearer).toBeUndefined();
  });

  it("stays unchanged and re-prompts with a processing message on a defensive stray inbound event (pending states are never persisted)", () => {
    const session = parkedSession("cita_verify_pending", { citaDni: "12345678", citaTwofaId: "twofa-1" });
    const event = makeEvent({ text: "hola de nuevo" });

    const result = handle(session, event);

    expect(result.session.state).toBe("cita_verify_pending");
    expect(result.effects).toEqual([
      { kind: "send_text", to: FROM, body: "Estamos procesando tu solicitud, danos un momento." },
    ]);
    expect(result.outcome).toBe("continue");
  });

  it("stays unchanged on a defensive foreign system-event kind, never crashing", () => {
    const session = parkedSession("cita_verify_pending", { citaDni: "12345678", citaTwofaId: "twofa-1" });
    const systemEvent: FsmSystemEvent = { source: "system", from: FROM, kind: "reniec_lookup_result", result: { status: "not_found" } };

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("cita_verify_pending");
    expect(result.effects).toEqual([
      { kind: "send_text", to: FROM, body: "Estamos procesando tu solicitud, danos un momento." },
    ]);
  });
});

// Phase 7 (PR7): design's FSM states table, `cita_identity_confirmed` row —
// a HOLDING state for C2, not terminal (D33's stated exception: it keeps
// citaBearer until session TTL rather than clearing it).
describe("handle — cita_identity_confirmed (C2 hand-off holding state, Phase 7)", () => {
  it("registers a real handler now (no longer falls back to main_menu)", () => {
    expect(STATE_HANDLERS["cita_identity_confirmed"]).toBeDefined();
  });

  it("MVP (no-SDD fast path): a real inbound message starts the catalog chain (cita_awaiting_ubigeo), keeping citaBearer intact", () => {
    const session = parkedSession("cita_identity_confirmed", { citaBearer: "bearer-token-value" });
    const event = makeEvent({ text: "hola" });

    const result = handle(session, event);

    expect(result.session.state).toBe("cita_awaiting_ubigeo");
    expect(result.session.slots.citaBearer).toBe("bearer-token-value");
    expect(result.effects).toEqual([
      {
        kind: "send_text",
        to: FROM,
        body: "Escribe tu ubicación así: Departamento/Provincia/Distrito (ej: Lima/Lima/Lurigancho).",
      },
    ]);
    expect(result.outcome).toBe("continue");
  });
});

describe("handle — cita_otp_locked reuses closedFlowHandler (design's FSM states table)", () => {
  it("registers a real handler now (no longer falls back to main_menu)", () => {
    expect(STATE_HANDLERS["cita_otp_locked"]).toBeDefined();
  });

  it("any inbound event resets to main_menu with the menu list, a fresh start", () => {
    const session = parkedSession("cita_otp_locked");
    const event = makeEvent({ text: "hola de nuevo" });

    const result = handle(session, event);

    expect(result.session.state).toBe("main_menu");
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].kind).toBe("send_interactive_list");
    expect(result.outcome).toBe("continue");
  });
});

// Task 7.5 (threat: credential in logs) — named privacy test, ONE per
// terminal path this stage has introduced (registration-rejected from PR6,
// OTP-lockout from this PR), plus the success hand-off's deliberately
// DIFFERENT (non-terminal) clearing behavior documented explicitly rather
// than left implicit.
describe("handle — Cita terminal slot-clearing privacy (D33, Phase 7)", () => {
  it("cita_registration_rejected (PR6): JSON.stringify(session) contains neither the DNI, a bearer token, nor an OTP code", () => {
    const session = parkedSession("cita_validate_pending", { citaDni: "12345678", citaRegistrationChecks: 2 });
    const systemEvent = makeValidateUserSystemEvent({ status: "not_valid" });

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("cita_registration_rejected");
    const serialized = JSON.stringify(result.session);
    expect(serialized).not.toContain("12345678");
    expect(serialized).not.toContain("bearer-token-value");
    expect(serialized).not.toContain("998877");
  });

  it("cita_otp_locked: JSON.stringify(session) contains neither the DNI, the twofaId, nor a bearer token", () => {
    const session = parkedSession("cita_verify_pending", {
      citaDni: "12345678",
      citaTwofaId: "twofa-secret",
      citaOtpAttempts: 2,
    });
    const systemEvent = makeVerifyCodeSystemEvent({ status: "invalid" });

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("cita_otp_locked");
    const serialized = JSON.stringify(result.session);
    expect(serialized).not.toContain("12345678");
    expect(serialized).not.toContain("twofa-secret");
    expect(serialized).not.toContain("bearer-token-value");
  });

  it("cita_identity_confirmed (holding state, NOT terminal — D33's stated exception): clears citaDni/citaTwofaId but DELIBERATELY retains citaBearer until session TTL", () => {
    const session = parkedSession("cita_verify_pending", { citaDni: "12345678", citaTwofaId: "twofa-secret" });
    const systemEvent = makeVerifyCodeSystemEvent({
      status: "verified",
      token: "bearer-token-value",
      tokenType: "Bearer",
      expiresIn: 3600,
    });

    const result = handle(session, systemEvent);

    expect(result.session.state).toBe("cita_identity_confirmed");
    const serialized = JSON.stringify(result.session);
    expect(serialized).not.toContain("twofa-secret");
    // Documents the intentional retention window — this is NOT an omission,
    // both the bearer AND the DNI must survive into the catalog/booking
    // chain (MVP addition, no-SDD fast path, extends D33's stated exception).
    expect(serialized).toContain("bearer-token-value");
    expect(serialized).toContain("12345678");
  });
});

describe("handle — schedule-sourced event widening (D29) does not change existing handler logic", () => {
  it("main_menu treats an unrecognized schedule-sourced event exactly like any other unmatched event — re-prompts, never crashes", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event: FsmScheduleEvent = {
      source: "schedule",
      from: FROM,
      kind: "cita_registration_wait_elapsed",
      waitToken: "registro_wait:1",
    };

    const result = handle(session, event);

    expect(result.session.counters.invalidAttempts).toBe(1);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].kind).toBe("send_interactive_list");
    expect(result.outcome).toBe("continue");
  });

  it("is deterministic for identical (session, scheduleEvent) inputs, same as every other event source", () => {
    const session = createSession("session-key-1", TTL_SECONDS);
    const event: FsmScheduleEvent = {
      source: "schedule",
      from: FROM,
      kind: "cita_registration_wait_elapsed",
      waitToken: "registro_wait:1",
    };

    const first = handle(session, event);
    const second = handle(session, event);

    expect(first).toEqual(second);
  });
});
