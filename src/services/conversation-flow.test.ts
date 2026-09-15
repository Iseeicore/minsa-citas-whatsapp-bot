import { describe, expect, it, vi } from "vitest";
import type pino from "pino";
import type { InboundConversationEvent } from "../domain/inbound-conversation-event.js";
import type {
  ButtonMessage,
  InteractiveList,
  WhatsappOutboundSender,
} from "../ports/whatsapp-outbound-sender.js";
import type { ReniecLookupClient, ReniecLookupResult } from "../ports/reniec-lookup-client.js";
import type { QuejaPayload, QuejaSubmissionResult, QuejasSubmissionClient } from "../ports/quejas-submission-client.js";
import { createMemorySessionStore } from "../adapters/memory-session-store.js";
import { msisdnDigest } from "../domain/msisdn-fingerprint.js";
import {
  FsmContractViolationError,
  QuejasSubmissionClientNotConfiguredError,
  TransientFailureError,
} from "../domain/errors.js";
import { assertReentryEmittedNoQueryEffect, createConversationFlowService, soleQueryEffect } from "./conversation-flow.js";

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

function fakeReniecLookupClient(opts: { result?: ReniecLookupResult; failWith?: Error } = {}): {
  client: ReniecLookupClient;
  calls: string[];
} {
  const calls: string[] = [];
  const result: ReniecLookupResult = opts.result ?? { status: "not_found" };

  const client: ReniecLookupClient = {
    async lookup(dni: string) {
      calls.push(dni);
      if (opts.failWith !== undefined) throw opts.failWith;
      return result;
    },
  };

  return { client, calls };
}

// PR5: hand-written fake — task 5.4, "no real adapter needed" (the real
// http-quejas-submission-client.ts stays Phase 7, D21-gated).
function fakeQuejasSubmissionClient(opts: { result?: QuejaSubmissionResult; failWith?: Error } = {}): {
  client: QuejasSubmissionClient;
  payloads: QuejaPayload[];
} {
  const payloads: QuejaPayload[] = [];
  const result: QuejaSubmissionResult = opts.result ?? { status: "accepted" };

  const client: QuejasSubmissionClient = {
    async submit(payload: QuejaPayload) {
      payloads.push(payload);
      if (opts.failWith !== undefined) throw opts.failWith;
      return result;
    },
  };

  return { client, payloads };
}

function makeService(
  sender: WhatsappOutboundSender,
  sessionStore = createMemorySessionStore({ logger: fakeLogger() }),
  reniecLookupClient: ReniecLookupClient = fakeReniecLookupClient().client,
  quejasSubmissionClient?: QuejasSubmissionClient
) {
  return {
    sessionStore,
    service: createConversationFlowService({
      sessionStore,
      sender,
      reniecLookupClient,
      quejasSubmissionClient,
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

  it("a matched menu selection advances state, persists it, and sends one immediate reply (D23 — no more silent menu taps)", async () => {
    const { sender, calls } = fakeSender();
    const { sessionStore, service } = makeService(sender);
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    await service.process(makeEvent({ interactiveReplyId: "agendar_cita" }));

    expect(calls).toEqual([{ method: "sendText", to: FROM_MSISDN }]);
    const stored = await sessionStore.load(key);
    expect(stored?.state).toBe("awaiting_flow_start");
    expect(stored?.slots.menuChoice).toBe("agendar_cita");
    expect(stored?.counters.messagesReceived).toBe(1);
    expect(stored?.counters.messagesSent).toBe(1);
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

describe("createConversationFlowService — D20 bounded re-entry (con-DNI RENIEC turn)", () => {
  const DNI = "12345678";
  const NOMBRE = "Juan Perez";
  const MATCH_RESULT: ReniecLookupResult = {
    status: "found",
    nombres: "Juan Carlos",
    apellidoPaterno: "Perez",
    apellidoMaterno: "Lopez",
  };

  async function driveToAwaitingNombre(service: ReturnType<typeof makeService>["service"]) {
    await service.process(makeEvent({ interactiveReplyId: "registrar_reclamo" })); // -> reclamo_identity_choice
    await service.process(makeEvent({ interactiveReplyId: "reclamo_con_dni" })); // -> reclamo_awaiting_dni
    await service.process(makeEvent({ text: DNI })); // -> reclamo_awaiting_nombre
  }

  it("executes reniec_lookup exactly once, re-enters handle() exactly once (2 sends this turn), and persists the advanced session on a match", async () => {
    const { client: reniecLookupClient, calls: reniecCalls } = fakeReniecLookupClient({ result: MATCH_RESULT });
    const { sender, calls } = fakeSender();
    const { sessionStore, service } = makeService(sender, undefined, reniecLookupClient);
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    await driveToAwaitingNombre(service);
    calls.length = 0; // isolate this final turn's own sends

    await service.process(makeEvent({ text: NOMBRE }));

    expect(reniecCalls).toEqual([DNI]);
    expect(calls.map((c) => c.method)).toEqual(["sendText", "sendText"]);

    const stored = await sessionStore.load(key);
    expect(stored?.state).toBe("reclamo_awaiting_descripcion");
  });

  it("accumulates messagesSent across BOTH handle() passes over the full con-DNI turn sequence", async () => {
    const { client: reniecLookupClient } = fakeReniecLookupClient({ result: MATCH_RESULT });
    const { sender } = fakeSender();
    const { sessionStore, service } = makeService(sender, undefined, reniecLookupClient);
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    await driveToAwaitingNombre(service); // 3 turns: 1 send each = 3
    await service.process(makeEvent({ text: NOMBRE })); // re-entry turn: verificando + placeholder = 2

    const stored = await sessionStore.load(key);
    expect(stored?.counters.messagesReceived).toBe(4);
    expect(stored?.counters.messagesSent).toBe(5);
  });

  it("transitions to reclamo_rejected with outcome-driven rejection copy and clears the DNI/nombre slots on a RENIEC no-match — never throws", async () => {
    const { client: reniecLookupClient } = fakeReniecLookupClient({ result: { status: "not_found" } });
    const { sender, calls } = fakeSender();
    const { sessionStore, service } = makeService(sender, undefined, reniecLookupClient);
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    await driveToAwaitingNombre(service);
    await service.process(makeEvent({ text: NOMBRE }));

    // end_session executes as a no-op send (Stage A convention — see
    // executeEffect's "end_session" case), so it records no sender call.
    expect(calls.map((c) => c.method)).toEqual(["sendButtons", "sendText", "sendText", "sendText", "sendText"]);
    const stored = await sessionStore.load(key);
    expect(stored?.state).toBe("reclamo_rejected");
    expect(stored?.slots.dni).toBeUndefined();
    expect(stored?.slots.nombre).toBeUndefined();
  });

  it("propagates TransientFailureError from the reniec_lookup query effect and leaves the prior session persisted-unchanged (D20 persistence/retry semantics)", async () => {
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    const { sender } = fakeSender();
    const { client: workingReniecClient } = fakeReniecLookupClient();
    const { service: setupService } = makeService(sender, sessionStore, workingReniecClient);

    await driveToAwaitingNombre(setupService);
    const priorSession = await sessionStore.load(key);

    const { client: failingReniecClient } = fakeReniecLookupClient({
      failWith: new TransientFailureError("reniec unreachable"),
    });
    const { service: failingService } = makeService(sender, sessionStore, failingReniecClient);

    await expect(failingService.process(makeEvent({ text: NOMBRE }))).rejects.toBeInstanceOf(TransientFailureError);

    const afterFailure = await sessionStore.load(key);
    expect(afterFailure).toEqual(priorSession);
  });

  it("sources every effect's `to` — including the D20 re-entry pass — from event.from, never from slots (D17 discipline carried forward)", async () => {
    const { client: reniecLookupClient, calls: reniecCalls } = fakeReniecLookupClient({ result: MATCH_RESULT });
    const { sender, calls } = fakeSender();
    const { service } = makeService(sender, undefined, reniecLookupClient);

    await service.process(makeEvent({ interactiveReplyId: "registrar_reclamo" }));
    await service.process(makeEvent({ interactiveReplyId: "reclamo_con_dni" }));
    await service.process(makeEvent({ text: DNI }));
    await service.process(makeEvent({ text: NOMBRE }));

    // Proves FsmSystemEvent.from correctly carried event.from into the
    // SECOND handle() call — the re-entry pass's send effect still targets
    // the original citizen, not something re-derived from slots.
    expect(calls.every((call) => call.to === FROM_MSISDN)).toBe(true);
    expect(reniecCalls).toEqual([DNI]);
  });
});

describe("createConversationFlowService — PR5: quejas_submit bounded re-entry (con-DNI and sin-DNI)", () => {
  const DNI = "12345678";
  const NOMBRE = "Juan Perez";
  const MATCH_RESULT: ReniecLookupResult = {
    status: "found",
    nombres: "Juan Carlos",
    apellidoPaterno: "Perez",
    apellidoMaterno: "Lopez",
  };

  it("executes quejas_submit exactly once and persists reclamo_confirmed on an accepted con-DNI submission", async () => {
    const { client: reniecLookupClient } = fakeReniecLookupClient({ result: MATCH_RESULT });
    const { client: quejasSubmissionClient, payloads } = fakeQuejasSubmissionClient({
      result: { status: "accepted", reference: "REF-42" },
    });
    const { sender } = fakeSender();
    const { sessionStore, service } = makeService(sender, undefined, reniecLookupClient, quejasSubmissionClient);
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    await service.process(makeEvent({ interactiveReplyId: "registrar_reclamo" }));
    await service.process(makeEvent({ interactiveReplyId: "reclamo_con_dni" }));
    await service.process(makeEvent({ text: DNI }));
    await service.process(makeEvent({ text: NOMBRE })); // -> reclamo_awaiting_descripcion (RENIEC match)
    await service.process(makeEvent({ text: "Fuga de agua" })); // -> reclamo_awaiting_foto
    await service.process(makeEvent({ mediaId: "media-1" })); // -> quejas_submit + re-entry -> reclamo_confirmed

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual({
      dni: DNI,
      nombre_completo: NOMBRE,
      celular: FROM_MSISDN,
      queja: "Fuga de agua",
      imagen: null,
    });

    const stored = await sessionStore.load(key);
    expect(stored?.state).toBe("reclamo_confirmed");
  });

  it("sin-DNI: submits with dni: null / nombre_completo: null and persists reclamo_confirmed", async () => {
    const { client: quejasSubmissionClient, payloads } = fakeQuejasSubmissionClient();
    const { sender } = fakeSender();
    const { sessionStore, service } = makeService(sender, undefined, undefined, quejasSubmissionClient);
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    await service.process(makeEvent({ interactiveReplyId: "registrar_reclamo" }));
    await service.process(makeEvent({ interactiveReplyId: "reclamo_sin_dni" })); // -> reclamo_awaiting_descripcion
    await service.process(makeEvent({ text: "Fuga de agua" })); // -> reclamo_awaiting_foto
    await service.process(makeEvent({ text: "OMITIR" })); // -> quejas_submit + re-entry -> reclamo_confirmed

    expect(payloads).toHaveLength(1);
    expect(payloads[0].dni).toBeNull();
    expect(payloads[0].nombre_completo).toBeNull();
    expect(payloads[0].queja).toBe("Fuga de agua");

    const stored = await sessionStore.load(key);
    expect(stored?.state).toBe("reclamo_confirmed");
  });

  it("persists reclamo_failed on a rejected quejas submission — never throws (D24)", async () => {
    const { client: quejasSubmissionClient } = fakeQuejasSubmissionClient({
      result: { status: "rejected", reason: "media_too_large" },
    });
    const { sender } = fakeSender();
    const { sessionStore, service } = makeService(sender, undefined, undefined, quejasSubmissionClient);
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    await service.process(makeEvent({ interactiveReplyId: "registrar_reclamo" }));
    await service.process(makeEvent({ interactiveReplyId: "reclamo_sin_dni" }));
    await service.process(makeEvent({ text: "Fuga de agua" }));
    await service.process(makeEvent({ text: "OMITIR" }));

    const stored = await sessionStore.load(key);
    expect(stored?.state).toBe("reclamo_failed");
  });

  it("D22: terminal session excludes the queja text after a confirmed submission", async () => {
    const { client: quejasSubmissionClient } = fakeQuejasSubmissionClient();
    const { sender } = fakeSender();
    const { sessionStore, service } = makeService(sender, undefined, undefined, quejasSubmissionClient);
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    await service.process(makeEvent({ interactiveReplyId: "registrar_reclamo" }));
    await service.process(makeEvent({ interactiveReplyId: "reclamo_sin_dni" }));
    await service.process(makeEvent({ text: "detalle sensible del reclamo" }));
    await service.process(makeEvent({ text: "OMITIR" }));

    const stored = await sessionStore.load(key);
    expect(JSON.stringify(stored)).not.toContain("detalle sensible del reclamo");
  });

  it("D17/D22: the submitted celular is event.from, ignoring a decoy value planted directly in a loaded session's slots", async () => {
    const { client: quejasSubmissionClient, payloads } = fakeQuejasSubmissionClient();
    const { sender } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    // Plant a decoy celular directly into a parked session, simulating a
    // corrupted/manually-constructed session — the executor must still
    // source celular from the in-flight event, never from slots.
    await sessionStore.save({
      schemaVersion: 1,
      sessionKey: key,
      state: "reclamo_awaiting_foto",
      slots: { queja: "algo", celular: "DECOY-0000000" },
      history: ["reclamo_awaiting_foto"],
      counters: { messagesSent: 0, messagesReceived: 0, invalidAttempts: 0 },
      ttlSeconds: SESSION_TTL_SECONDS,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { service } = makeService(sender, sessionStore, undefined, quejasSubmissionClient);
    await service.process(makeEvent({ text: "OMITIR" }));

    expect(payloads).toHaveLength(1);
    expect(payloads[0].celular).toBe(FROM_MSISDN);
  });

  it("throws QuejasSubmissionClientNotConfiguredError when a quejas_submit effect is emitted but no client is injected (Phase 7 not yet wired)", async () => {
    const { sender } = fakeSender();
    const { service } = makeService(sender, undefined, undefined, undefined);

    await service.process(makeEvent({ interactiveReplyId: "registrar_reclamo" }));
    await service.process(makeEvent({ interactiveReplyId: "reclamo_sin_dni" }));
    await service.process(makeEvent({ text: "Fuga de agua" }));

    await expect(service.process(makeEvent({ text: "OMITIR" }))).rejects.toBeInstanceOf(
      QuejasSubmissionClientNotConfiguredError
    );
  });
});

describe("soleQueryEffect / assertReentryEmittedNoQueryEffect (D20 contract-violation unit tests)", () => {
  it("soleQueryEffect returns undefined for a turn with no query effect", () => {
    expect(soleQueryEffect([{ kind: "send_text", to: FROM_MSISDN, body: "hola" }])).toBeUndefined();
  });

  it("soleQueryEffect returns the single query effect when exactly one is present", () => {
    const queryEffect = { kind: "reniec_lookup" as const, dni: "12345678" };
    expect(soleQueryEffect([{ kind: "send_text", to: FROM_MSISDN, body: "hola" }, queryEffect])).toEqual(
      queryEffect
    );
  });

  it("soleQueryEffect throws FsmContractViolationError when more than one query effect is present in a single pass", () => {
    const effects = [
      { kind: "reniec_lookup" as const, dni: "11111111" },
      { kind: "reniec_lookup" as const, dni: "22222222" },
    ];
    expect(() => soleQueryEffect(effects)).toThrow(FsmContractViolationError);
  });

  it("assertReentryEmittedNoQueryEffect does not throw for send-only effects", () => {
    expect(() =>
      assertReentryEmittedNoQueryEffect([{ kind: "send_text", to: FROM_MSISDN, body: "hola" }])
    ).not.toThrow();
  });

  it("assertReentryEmittedNoQueryEffect throws FsmContractViolationError when the re-entered pass itself emits a query effect", () => {
    expect(() =>
      assertReentryEmittedNoQueryEffect([{ kind: "reniec_lookup" as const, dni: "12345678" }])
    ).toThrow(FsmContractViolationError);
  });
});
