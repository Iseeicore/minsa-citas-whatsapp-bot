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
import type { DownloadedMedia, WhatsappMediaDownloader } from "../ports/whatsapp-media-downloader.js";
import type { ScheduledCheckScheduler } from "../ports/scheduled-check-scheduler.js";
import type { MinsaIdentityClient, ValidateUserResult, VerifyCodeResult } from "../ports/minsa-identity-client.js";
import type { FsmEffect, FsmQueryEffect, FsmScheduleEffect } from "../domain/conversation-fsm.js";
import type { ConversationSession } from "../domain/conversation-session.js";
import type { ScheduledCheckJobData } from "../domain/conversation-job.js";
import { createMemorySessionStore } from "../adapters/memory-session-store.js";
import { msisdnDigest } from "../domain/msisdn-fingerprint.js";
import { encodeImagenField } from "../domain/quejas-imagen-encoding.js";
import {
  FsmContractViolationError,
  MediaTooLargeError,
  ScheduledCheckSchedulerNotConfiguredError,
  TransientFailureError,
} from "../domain/errors.js";
import {
  assertAtMostOneScheduleEffect,
  assertReentryEmittedNoQueryEffect,
  createConversationFlowService,
  isScheduleEffect,
  isSendEffect,
  runScheduleEffects,
  soleQueryEffect,
} from "./conversation-flow.js";

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

// Phase 7 (PR7): a hand-written fake — the real Meta media downloader
// (meta-media-downloader.ts) is unit-tested against fakes on its own; this
// service test only needs to prove conversation-flow.ts calls the port
// correctly and threads MediaTooLargeError per D21.
function fakeWhatsappMediaDownloader(opts: { media?: DownloadedMedia; failWith?: Error } = {}): {
  downloader: WhatsappMediaDownloader;
  calls: string[];
} {
  const calls: string[] = [];
  const media: DownloadedMedia = opts.media ?? {
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: "image/jpeg",
    sizeBytes: 3,
  };

  const downloader: WhatsappMediaDownloader = {
    async download(mediaId: string) {
      calls.push(mediaId);
      if (opts.failWith !== undefined) throw opts.failWith;
      return media;
    },
  };

  return { downloader, calls };
}

// D29: hand-written fake — `redis-scheduled-check-scheduler.ts` (the real
// BullMQ-backed adapter) stays Phase 5. Mirrors fakeQuejasSubmissionClient's
// precedent (PR5's own "no real adapter needed yet" comment).
function fakeScheduledCheckScheduler(opts: { failWith?: Error } = {}): {
  scheduler: ScheduledCheckScheduler;
  calls: { data: ScheduledCheckJobData; delaySeconds: number }[];
} {
  const calls: { data: ScheduledCheckJobData; delaySeconds: number }[] = [];

  const scheduler: ScheduledCheckScheduler = {
    async schedule(data: ScheduledCheckJobData, delaySeconds: number) {
      calls.push({ data, delaySeconds });
      if (opts.failWith !== undefined) throw opts.failWith;
    },
    async close() {},
  };

  return { scheduler, calls };
}

// PR6/PR7 (Phase 6/7): hand-written fake — the real `HttpMinsaIdentityClient`
// (Phase 3) is unit-tested against fakes on its own; this service test only
// needs to prove conversation-flow.ts calls the port correctly.
function fakeMinsaIdentityClient(
  opts: {
    result?: ValidateUserResult;
    failWith?: Error;
    verifyCodeResult?: VerifyCodeResult;
    verifyCodeFailWith?: Error;
  } = {}
): {
  client: MinsaIdentityClient;
  calls: string[];
  verifyCalls: { twofaId: string; code: string }[];
} {
  const calls: string[] = [];
  const verifyCalls: { twofaId: string; code: string }[] = [];
  const result: ValidateUserResult = opts.result ?? { status: "not_valid" };
  const verifyCodeResult: VerifyCodeResult = opts.verifyCodeResult ?? { status: "invalid" };

  const client: MinsaIdentityClient = {
    async validateUser(numeroDocumento: string) {
      calls.push(numeroDocumento);
      if (opts.failWith !== undefined) throw opts.failWith;
      return result;
    },
    async verifyCode(input: { twofaId: string; code: string }) {
      verifyCalls.push(input);
      if (opts.verifyCodeFailWith !== undefined) throw opts.verifyCodeFailWith;
      return verifyCodeResult;
    },
  };

  return { client, calls, verifyCalls };
}

function makeService(
  sender: WhatsappOutboundSender,
  sessionStore = createMemorySessionStore({ logger: fakeLogger() }),
  reniecLookupClient: ReniecLookupClient = fakeReniecLookupClient().client,
  quejasSubmissionClient: QuejasSubmissionClient = fakeQuejasSubmissionClient().client,
  whatsappMediaDownloader: WhatsappMediaDownloader = fakeWhatsappMediaDownloader().downloader,
  // D29: OPTIONAL — undefined by default, matching ConversationFlowServiceDeps.
  // No existing test below passes a scheduler, so every one of them proves
  // the widening left process()'s observable behavior unchanged.
  scheduledCheckScheduler?: ScheduledCheckScheduler,
  // Phase 8: REQUIRED — matching ConversationFlowServiceDeps, mirroring
  // quejasSubmissionClient/whatsappMediaDownloader's own default-fake
  // pattern above. A pre-Phase-8 test that never touches a Cita
  // validate_user/verify_code effect proves this default is inert.
  minsaIdentityClient: MinsaIdentityClient = fakeMinsaIdentityClient().client
) {
  return {
    sessionStore,
    service: createConversationFlowService({
      sessionStore,
      sender,
      reniecLookupClient,
      quejasSubmissionClient,
      whatsappMediaDownloader,
      scheduledCheckScheduler,
      minsaIdentityClient,
      config: { sessionKeySecret: SESSION_KEY_SECRET, sessionTtlSeconds: SESSION_TTL_SECONDS },
    }),
  };
}

/** A fully-formed session, park-able at any state directly via sessionStore.save() — bypasses handle() entirely, mirroring the D17 decoy-slot test's own direct-save technique above. */
function fullSession(overrides: Partial<ConversationSession> = {}): ConversationSession {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    sessionKey: msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET),
    state: "main_menu",
    slots: {},
    history: ["main_menu"],
    counters: { messagesSent: 0, messagesReceived: 0, invalidAttempts: 0 },
    ttlSeconds: SESSION_TTL_SECONDS,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeScheduledJob(overrides: Partial<ScheduledCheckJobData> = {}): ScheduledCheckJobData {
  return {
    source: "schedule",
    sessionKey: msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET),
    to: FROM_MSISDN,
    kind: "cita_registration_wait_elapsed",
    waitToken: "registro_wait:1",
    expectedState: "cita_registration_wait",
    scheduledAt: "2026-01-01T00:05:00.000Z",
    ...overrides,
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

  // PR6 (Phase 6): the D23 tail-call now lands on the REAL Cita entry point
  // (`cita_awaiting_dni`), replacing PR1's placeholder — design's Migration/
  // Rollout section calls this exact assertion change out as intended, not a
  // regression.
  it("a matched menu selection advances state, persists it, and sends one immediate reply (D23 — no more silent menu taps)", async () => {
    const { sender, calls } = fakeSender();
    const { sessionStore, service } = makeService(sender);
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    await service.process(makeEvent({ interactiveReplyId: "agendar_cita" }));

    expect(calls).toEqual([{ method: "sendText", to: FROM_MSISDN }]);
    const stored = await sessionStore.load(key);
    expect(stored?.state).toBe("cita_awaiting_dni");
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

  it("executes quejas_submit exactly once, downloads + encodes the photo (D21 pipeline), and persists reclamo_confirmed on an accepted con-DNI submission", async () => {
    const { client: reniecLookupClient } = fakeReniecLookupClient({ result: MATCH_RESULT });
    const { client: quejasSubmissionClient, payloads } = fakeQuejasSubmissionClient({
      result: { status: "accepted", reference: "REF-42" },
    });
    const media: DownloadedMedia = { bytes: new Uint8Array([10, 20, 30, 40]), mimeType: "image/png", sizeBytes: 4 };
    const { downloader: whatsappMediaDownloader, calls: downloadCalls } = fakeWhatsappMediaDownloader({ media });
    const { sender } = fakeSender();
    const { sessionStore, service } = makeService(
      sender,
      undefined,
      reniecLookupClient,
      quejasSubmissionClient,
      whatsappMediaDownloader
    );
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    await service.process(makeEvent({ interactiveReplyId: "registrar_reclamo" }));
    await service.process(makeEvent({ interactiveReplyId: "reclamo_con_dni" }));
    await service.process(makeEvent({ text: DNI }));
    await service.process(makeEvent({ text: NOMBRE })); // -> reclamo_awaiting_descripcion (RENIEC match)
    await service.process(makeEvent({ text: "Fuga de agua" })); // -> reclamo_awaiting_foto
    await service.process(makeEvent({ mediaId: "media-1" })); // -> quejas_submit + re-entry -> reclamo_confirmed

    expect(downloadCalls).toEqual(["media-1"]);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual({
      dni: DNI,
      nombre_completo: NOMBRE,
      celular: FROM_MSISDN,
      queja: "Fuga de agua",
      imagen: encodeImagenField(media),
    });

    const stored = await sessionStore.load(key);
    expect(stored?.state).toBe("reclamo_confirmed");
  });

  it("skips the media-download pipeline entirely and submits imagen: null when no photo was captured (OMITIR)", async () => {
    const { client: quejasSubmissionClient, payloads } = fakeQuejasSubmissionClient();
    const { downloader: whatsappMediaDownloader, calls: downloadCalls } = fakeWhatsappMediaDownloader();
    const { sender } = fakeSender();
    const { service } = makeService(sender, undefined, undefined, quejasSubmissionClient, whatsappMediaDownloader);

    await service.process(makeEvent({ interactiveReplyId: "registrar_reclamo" }));
    await service.process(makeEvent({ interactiveReplyId: "reclamo_sin_dni" }));
    await service.process(makeEvent({ text: "Fuga de agua" }));
    await service.process(makeEvent({ text: "OMITIR" }));

    expect(downloadCalls).toEqual([]);
    expect(payloads[0]?.imagen).toBeNull();
  });

  // D21: MediaTooLargeError is caught INSIDE the quejas_submit executor and
  // converted to a citizen-facing rejected result — the FSM, not the
  // adapter, owns the wording. quejasSubmissionClient.submit() must never be
  // called in this path (the oversized file never reaches the quejas API).
  it("D21: converts a MediaTooLargeError from the media downloader into a quejas_submit_result rejected(media_too_large) — never calls submit()", async () => {
    const { downloader: whatsappMediaDownloader } = fakeWhatsappMediaDownloader({
      failWith: new MediaTooLargeError("file too big"),
    });
    const { client: quejasSubmissionClient, payloads } = fakeQuejasSubmissionClient();
    const { sender } = fakeSender();
    const { sessionStore, service } = makeService(
      sender,
      undefined,
      undefined,
      quejasSubmissionClient,
      whatsappMediaDownloader
    );
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);

    await service.process(makeEvent({ interactiveReplyId: "registrar_reclamo" }));
    await service.process(makeEvent({ interactiveReplyId: "reclamo_sin_dni" }));
    await service.process(makeEvent({ text: "Fuga de agua" }));
    await service.process(makeEvent({ mediaId: "media-huge" }));

    expect(payloads).toHaveLength(0);
    const stored = await sessionStore.load(key);
    expect(stored?.state).toBe("reclamo_failed");
  });

  it("propagates TransientFailureError from the media downloader (network/timeout) and leaves the prior session persisted-unchanged", async () => {
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    const { sender } = fakeSender();

    const { service: setupService } = makeService(sender, sessionStore);
    await setupService.process(makeEvent({ interactiveReplyId: "registrar_reclamo" }));
    await setupService.process(makeEvent({ interactiveReplyId: "reclamo_sin_dni" }));
    await setupService.process(makeEvent({ text: "Fuga de agua" }));
    const priorSession = await sessionStore.load(key);

    const { downloader: failingDownloader } = fakeWhatsappMediaDownloader({
      failWith: new TransientFailureError("meta graph api unreachable"),
    });
    const { service: failingService } = makeService(sender, sessionStore, undefined, undefined, failingDownloader);

    await expect(failingService.process(makeEvent({ mediaId: "media-1" }))).rejects.toBeInstanceOf(
      TransientFailureError
    );

    const afterFailure = await sessionStore.load(key);
    expect(afterFailure).toEqual(priorSession);
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

  // Phase 7: `quejasSubmissionClient` is now a REQUIRED dependency — worker.ts
  // always constructs and injects the real HttpQuejasSubmissionClient, so the
  // PR5-era "not configured" placeholder path (QuejasSubmissionClientNotConfiguredError)
  // is no longer reachable through this service. The error class and its
  // classifyWorkerOutcome() mapping remain defined (see errors.ts /
  // worker-outcome.ts) as a defensive, never-triggered safety net.
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

// D28: isSendEffect must be a POSITIVE enumeration of the four known
// send-effect kinds, never `!isQueryEffect`. The negation is a latent bug:
// today only two effect families exist (send, query), so the negation
// happens to agree with the positive form — but it would silently
// misclassify any future third effect category (e.g. Stage C1's upcoming
// FsmScheduleEffect, D28) as sendable. This test proves the positive form
// directly, independent of how many other effect kinds exist.
describe("isSendEffect (D28: positive enumeration, not !isQueryEffect)", () => {
  it("returns true for each of the four known send-effect kinds", () => {
    const sendEffects: FsmEffect[] = [
      { kind: "send_text", to: FROM_MSISDN, body: "hola" },
      {
        kind: "send_interactive_list",
        to: FROM_MSISDN,
        body: "hola",
        buttonLabel: "Ver opciones",
        sections: [],
      },
      { kind: "send_buttons", to: FROM_MSISDN, body: "hola", buttons: [] },
      { kind: "end_session", to: FROM_MSISDN },
    ];

    for (const effect of sendEffects) {
      expect(isSendEffect(effect)).toBe(true);
    }
  });

  it("returns false for a query effect", () => {
    expect(isSendEffect({ kind: "reniec_lookup", dni: "12345678" })).toBe(false);
  });

  it("returns false for a non-send, non-query-shaped effect (a future third category, e.g. schedule_check) — proves the enumeration is positive, not a negation of isQueryEffect", () => {
    const futureThirdCategoryShapedEffect = { kind: "schedule_check" } as unknown as FsmEffect;

    expect(isSendEffect(futureThirdCategoryShapedEffect)).toBe(false);
  });
});

// D28 (Stage C1, PR4): FsmScheduleEffect is a THIRD effect category, never a
// query effect — see conversation-fsm.ts's own D28 comment. This fixture
// helper is shared across the schedule-effect describe blocks below.
function makeScheduleEffect(overrides: Partial<FsmScheduleEffect> = {}): FsmScheduleEffect {
  return {
    kind: "schedule_check",
    sessionKey: "digest-does-not-matter-here",
    to: FROM_MSISDN,
    delaySeconds: 300,
    checkKind: "cita_registration_wait_elapsed",
    waitToken: "registro_wait:1",
    expectedState: "cita_registration_wait",
    ...overrides,
  };
}

describe("isScheduleEffect (D28)", () => {
  it("returns true for a schedule_check effect", () => {
    expect(isScheduleEffect(makeScheduleEffect())).toBe(true);
  });

  it("returns false for a send effect", () => {
    expect(isScheduleEffect({ kind: "send_text", to: FROM_MSISDN, body: "hola" })).toBe(false);
  });

  it("returns false for a query effect", () => {
    expect(isScheduleEffect({ kind: "reniec_lookup", dni: "12345678" })).toBe(false);
  });
});

// Spec's "Schedule effect does not count toward the query-effect bound"
// scenario, verified directly against soleQueryEffect (D20's own guard,
// UNCHANGED source) — proves the widening stayed additive without touching
// isQueryEffect's implementation at all.
describe("soleQueryEffect ignores schedule_check (D28 — schedule is not a query effect)", () => {
  it("recognizes exactly one query effect in a pass that also carries a schedule_check effect", () => {
    const queryEffect: FsmQueryEffect = { kind: "reniec_lookup", dni: "12345678" };
    const scheduleEffect = makeScheduleEffect();

    expect(soleQueryEffect([scheduleEffect, queryEffect])).toEqual(queryEffect);
  });

  it("returns undefined for a pass that carries only a schedule_check effect (no query effect at all)", () => {
    expect(soleQueryEffect([makeScheduleEffect()])).toBeUndefined();
  });
});

// D28, symmetric with soleQueryEffect: at most ONE schedule effect per pass.
// Exported for the same reason soleQueryEffect/assertReentryEmittedNoQueryEffect
// are (see conversation-flow.ts) — today's real FSM (Phase 4) never emits a
// schedule_check effect from any registered STATE_HANDLERS entry (Cita's
// DNI states are Phase 6), so this contract-violation path would otherwise
// be untestable without contriving FSM behavior that does not exist yet.
describe("assertAtMostOneScheduleEffect (D28, threat: unbounded scheduling)", () => {
  it("returns undefined for a turn with no schedule effect", () => {
    expect(assertAtMostOneScheduleEffect([{ kind: "send_text", to: FROM_MSISDN, body: "hola" }])).toBeUndefined();
  });

  it("returns the single schedule effect when exactly one is present", () => {
    const effect = makeScheduleEffect();
    expect(
      assertAtMostOneScheduleEffect([{ kind: "send_text", to: FROM_MSISDN, body: "hola" }, effect])
    ).toEqual(effect);
  });

  it("throws FsmContractViolationError when two schedule effects are present in a single pass", () => {
    const effects = [
      makeScheduleEffect({ waitToken: "registro_wait:1" }),
      makeScheduleEffect({ waitToken: "registro_wait:2" }),
    ];
    expect(() => assertAtMostOneScheduleEffect(effects)).toThrow(FsmContractViolationError);
  });
});

describe("runScheduleEffects (D29/D30 — the sole executor of a schedule_check effect)", () => {
  it("resolves without touching the scheduler when no schedule effect is present", async () => {
    const { scheduler, calls } = fakeScheduledCheckScheduler();

    await expect(
      runScheduleEffects(scheduler, [{ kind: "send_text", to: FROM_MSISDN, body: "hola" }])
    ).resolves.toBeUndefined();

    expect(calls).toHaveLength(0);
  });

  it("schedules exactly one job, translating the effect's own delaySeconds and fields into ScheduledCheckJobData", async () => {
    const { scheduler, calls } = fakeScheduledCheckScheduler();
    const effect = makeScheduleEffect({ sessionKey: "digest-1", delaySeconds: 300 });

    await runScheduleEffects(scheduler, [effect]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.delaySeconds).toBe(300);
    expect(calls[0]?.data).toMatchObject({
      source: "schedule",
      sessionKey: "digest-1",
      to: FROM_MSISDN,
      kind: "cita_registration_wait_elapsed",
      waitToken: "registro_wait:1",
      expectedState: "cita_registration_wait",
    });
  });

  it("throws ScheduledCheckSchedulerNotConfiguredError when a schedule effect is present but no scheduler is configured", async () => {
    await expect(runScheduleEffects(undefined, [makeScheduleEffect()])).rejects.toBeInstanceOf(
      ScheduledCheckSchedulerNotConfiguredError
    );
  });

  it("throws FsmContractViolationError before ever touching the scheduler when two schedule effects are present (threat: unbounded scheduling)", async () => {
    const { scheduler, calls } = fakeScheduledCheckScheduler();
    const effects = [
      makeScheduleEffect({ waitToken: "registro_wait:1" }),
      makeScheduleEffect({ waitToken: "registro_wait:2" }),
    ];

    await expect(runScheduleEffects(scheduler, effects)).rejects.toBeInstanceOf(FsmContractViolationError);
    expect(calls).toHaveLength(0);
  });
});

// D29/D31: processScheduled() is the second bounded-re-entry entry point —
// a timer fire, never a citizen message. Every session here is parked
// DIRECTLY via sessionStore.save() (bypassing handle() entirely), mirroring
// the D17 decoy-slot test's own direct-save technique above — this lets
// these tests exercise the idempotency guard without depending on any real
// Cita STATE_HANDLERS entry (Phase 6).
describe("createConversationFlowService — processScheduled() (D29/D31 idempotent fire)", () => {
  it("is a pure no-op — 0 sends, 0 schedules, 0 saves — when no session exists for the job's sessionKey (threat: untrusted job payload)", async () => {
    const { sender, calls } = fakeSender();
    const { scheduler, calls: scheduleCalls } = fakeScheduledCheckScheduler();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const saveSpy = vi.spyOn(sessionStore, "save");
    const { service } = makeService(sender, sessionStore, undefined, undefined, undefined, scheduler);

    await service.processScheduled(makeScheduledJob());

    expect(calls).toHaveLength(0);
    expect(scheduleCalls).toHaveLength(0);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("is a no-op when the session's current state does not match job.expectedState (threat: untrusted job payload)", async () => {
    const { sender, calls } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    await sessionStore.save(fullSession({ sessionKey: key, state: "main_menu", slots: { citaWaitToken: "registro_wait:1" } }));
    const saveSpy = vi.spyOn(sessionStore, "save");
    const { service } = makeService(sender, sessionStore);

    await service.processScheduled(
      makeScheduledJob({ sessionKey: key, expectedState: "cita_registration_wait", waitToken: "registro_wait:1" })
    );

    expect(calls).toHaveLength(0);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("is a no-op when the session's slots.citaWaitToken does not match job.waitToken — a stale/superseded/duplicate fire (D31)", async () => {
    const { sender, calls } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    await sessionStore.save(
      fullSession({ sessionKey: key, state: "main_menu", slots: { citaWaitToken: "registro_wait:2" } })
    );
    const saveSpy = vi.spyOn(sessionStore, "save");
    const { service } = makeService(sender, sessionStore);

    await service.processScheduled(
      makeScheduledJob({ sessionKey: key, expectedState: "main_menu", waitToken: "registro_wait:1" })
    );

    expect(calls).toHaveLength(0);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("is a no-op when the session has no citaWaitToken slot at all (already cleared by an earlier turn)", async () => {
    const { sender, calls } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    await sessionStore.save(fullSession({ sessionKey: key, state: "main_menu", slots: {} }));
    const saveSpy = vi.spyOn(sessionStore, "save");
    const { service } = makeService(sender, sessionStore);

    await service.processScheduled(
      makeScheduledJob({ sessionKey: key, expectedState: "main_menu", waitToken: "registro_wait:1" })
    );

    expect(calls).toHaveLength(0);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("proceeds to handle() and persists when state AND token match, WITHOUT incrementing counters.messagesReceived (D29 — a timer fire is not a citizen turn)", async () => {
    const { sender, calls } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    await sessionStore.save(
      fullSession({
        sessionKey: key,
        state: "main_menu",
        slots: { citaWaitToken: "registro_wait:1" },
        counters: { messagesSent: 2, messagesReceived: 3, invalidAttempts: 0 },
      })
    );
    const { service } = makeService(sender, sessionStore);

    await service.processScheduled(
      makeScheduledJob({ sessionKey: key, expectedState: "main_menu", waitToken: "registro_wait:1" })
    );

    // main_menu's handler treats an unrecognized schedule-sourced event
    // exactly like any other unmatched event (D29 widening, conversation-fsm.test.ts)
    // — re-prompts with the menu list, never crashes, emits no query effect.
    expect(calls).toEqual([{ method: "sendInteractiveList", to: FROM_MSISDN }]);
    const stored = await sessionStore.load(key);
    expect(stored?.counters.messagesReceived).toBe(3); // unchanged from before the fire
    expect(stored?.counters.messagesSent).toBe(3); // 2 prior + 1 this turn
    expect(stored?.counters.invalidAttempts).toBe(1);
  });

  it("sources every effect's `to` from job.to, never from a decoy value planted in slots (D17 discipline carried forward to the scheduled path)", async () => {
    const { sender, calls } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    await sessionStore.save(
      fullSession({
        sessionKey: key,
        state: "main_menu",
        // Decoy: a corrupted/manually-constructed session must never leak
        // into an outbound `to` — the executor sources it from job.to only.
        slots: { citaWaitToken: "registro_wait:1", to: "DECOY-0000000" },
      })
    );
    const { service } = makeService(sender, sessionStore);

    await service.processScheduled(
      makeScheduledJob({ sessionKey: key, to: FROM_MSISDN, expectedState: "main_menu", waitToken: "registro_wait:1" })
    );

    expect(calls).toEqual([{ method: "sendInteractiveList", to: FROM_MSISDN }]);
  });
});

// PR6 (Phase 6): `validate_user` is the FIRST query effect a REAL
// STATE_HANDLERS entry emits (cita_awaiting_dni/cita_registration_wait) —
// proves runQueryEffect's new switch case end to end, mirroring
// reniec_lookup's own D20 bounded re-entry coverage above.
describe("createConversationFlowService — validate_user bounded re-entry (D20/D26, Phase 6)", () => {
  it("valid: advances to cita_awaiting_otp and stores slots.citaTwofaId", async () => {
    const { sender, calls } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    await sessionStore.save(fullSession({ sessionKey: key, state: "cita_awaiting_dni" }));
    const { client: minsaIdentityClient, calls: minsaCalls } = fakeMinsaIdentityClient({
      result: { status: "valid", twofaId: "twofa-1" },
    });
    const { service } = makeService(sender, sessionStore, undefined, undefined, undefined, undefined, minsaIdentityClient);

    await service.process(makeEvent({ text: "12345678" }));

    expect(minsaCalls).toEqual(["12345678"]);
    expect(calls.map((c) => c.method)).toEqual(["sendText", "sendText"]);
    const stored = await sessionStore.load(key);
    expect(stored?.state).toBe("cita_awaiting_otp");
    expect(stored?.slots.citaDni).toBe("12345678");
    expect(stored?.slots.citaTwofaId).toBe("twofa-1");
  });

  it("not_valid: advances to cita_registration_wait, records the ordinal check, and schedules the wait (D31)", async () => {
    const { sender } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    await sessionStore.save(fullSession({ sessionKey: key, state: "cita_awaiting_dni" }));
    const { client: minsaIdentityClient } = fakeMinsaIdentityClient({ result: { status: "not_valid" } });
    const { scheduler, calls: scheduleCalls } = fakeScheduledCheckScheduler();
    const { service } = makeService(sender, sessionStore, undefined, undefined, undefined, scheduler, minsaIdentityClient);

    await service.process(makeEvent({ text: "87654321" }));

    expect(scheduleCalls).toHaveLength(1);
    expect(scheduleCalls[0]?.delaySeconds).toBe(300);
    expect(scheduleCalls[0]?.data).toMatchObject({
      source: "schedule",
      sessionKey: key,
      to: FROM_MSISDN,
      kind: "cita_registration_wait_elapsed",
      waitToken: "registro_wait:1",
      expectedState: "cita_registration_wait",
    });
    const stored = await sessionStore.load(key);
    expect(stored?.state).toBe("cita_registration_wait");
    expect(stored?.slots.citaRegistrationChecks).toBe(1);
    expect(stored?.slots.citaWaitToken).toBe("registro_wait:1");
  });

  // Phase 8: `minsaIdentityClient` is now a REQUIRED dependency — worker.ts
  // always constructs and injects the real HttpMinsaIdentityClient, so the
  // PR6/PR7-era "not configured" placeholder path
  // (MinsaIdentityClientNotConfiguredError) is no longer reachable through
  // this service. The error class and its classifyWorkerOutcome() mapping
  // remain defined (see errors.ts / worker-outcome.ts) as a defensive,
  // never-triggered safety net — same treatment as
  // QuejasSubmissionClientNotConfiguredError above.
});

// PR6 (Phase 6): the "single most important correctness property" of this
// PR (per the assigned scope) — the citizen's early CONFIRMAR reply advances
// the session PAST cita_registration_wait, and the ORIGINAL scheduled job
// (still sitting in BullMQ with its delay) later fires carrying the NOW-STALE
// token/expectedState pair. processScheduled()'s existing D31 guard
// (unchanged by this PR — Phase 4/5 already implemented it) must silently
// no-op: proven here end to end against the REAL Cita STATE_HANDLERS chain
// for the first time (Phase 4/5's own D31 tests used main_menu fixtures,
// since no real Cita handler existed yet).
describe("createConversationFlowService — D31 race: early CONFIRMAR reply then a stale scheduled fire (Phase 6)", () => {
  it("citizen replies CONFIRMAR before the timer fires; the stale job later fires as a pure no-op", async () => {
    const { sender, calls } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    // Session already parked in cita_registration_wait, as if the FIRST
    // not_valid check armed a wait with token "registro_wait:1" — mirrors
    // exactly what a real BullMQ delayed job would carry.
    await sessionStore.save(
      fullSession({
        sessionKey: key,
        state: "cita_registration_wait",
        slots: { citaDni: "12345678", citaRegistrationChecks: 1, citaWaitToken: "registro_wait:1" },
      })
    );
    const { client: minsaIdentityClient, calls: minsaCalls } = fakeMinsaIdentityClient({
      result: { status: "valid", twofaId: "twofa-99" },
    });
    const { service } = makeService(sender, sessionStore, undefined, undefined, undefined, undefined, minsaIdentityClient);

    // Step 1: the citizen replies "CONFIRMAR" BEFORE the timer ever fires.
    await service.process(makeEvent({ text: "CONFIRMAR" }));

    expect(minsaCalls).toEqual(["12345678"]);
    const afterConfirmar = await sessionStore.load(key);
    expect(afterConfirmar?.state).toBe("cita_awaiting_otp");
    expect(afterConfirmar?.slots.citaTwofaId).toBe("twofa-99");
    expect(afterConfirmar?.slots.citaWaitToken).toBeUndefined();
    const sendsAfterConfirmar = calls.length;

    // Step 2: the ORIGINAL scheduled job (armed before the early reply, still
    // carrying the now-stale "registro_wait:1"/"cita_registration_wait" pair)
    // fires anyway — BullMQ has no way to cancel it. It MUST be a silent
    // no-op: the session already moved on.
    await service.processScheduled(
      makeScheduledJob({
        sessionKey: key,
        to: FROM_MSISDN,
        expectedState: "cita_registration_wait",
        waitToken: "registro_wait:1",
      })
    );

    // Zero further sends, zero further MINSA calls, session unchanged.
    expect(calls).toHaveLength(sendsAfterConfirmar);
    expect(minsaCalls).toEqual(["12345678"]);
    const afterStaleFire = await sessionStore.load(key);
    expect(afterStaleFire).toEqual(afterConfirmar);
  });
});

// PR7 (Phase 7): `verify_code` is the SECOND MinsaIdentityClient query
// effect a real STATE_HANDLERS entry emits (cita_awaiting_otp) — proves
// runQueryEffect's `verify_code` switch case end to end, mirroring
// `validate_user`'s own D20 bounded re-entry coverage above.
describe("createConversationFlowService — verify_code bounded re-entry (D20/D33, Phase 7)", () => {
  it("verified: advances to cita_identity_confirmed and stores slots.citaBearer", async () => {
    const { sender, calls } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    await sessionStore.save(
      fullSession({
        sessionKey: key,
        state: "cita_awaiting_otp",
        slots: { citaDni: "12345678", citaTwofaId: "twofa-1" },
      })
    );
    const { client: minsaIdentityClient, verifyCalls } = fakeMinsaIdentityClient({
      verifyCodeResult: { status: "verified", token: "bearer-token-value", tokenType: "Bearer", expiresIn: 3600 },
    });
    const { service } = makeService(sender, sessionStore, undefined, undefined, undefined, undefined, minsaIdentityClient);

    await service.process(makeEvent({ text: "123456" }));

    expect(verifyCalls).toEqual([{ twofaId: "twofa-1", code: "123456" }]);
    expect(calls.map((c) => c.method)).toEqual(["sendText", "sendText"]);
    const stored = await sessionStore.load(key);
    expect(stored?.state).toBe("cita_identity_confirmed");
    expect(stored?.slots.citaBearer).toBe("bearer-token-value");
    expect(stored?.slots.citaDni).toBeUndefined();
    expect(stored?.slots.citaTwofaId).toBeUndefined();
  });

  it("invalid, first occurrence: re-prompts at cita_awaiting_otp and records citaOtpAttempts = 1", async () => {
    const { sender } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    await sessionStore.save(
      fullSession({
        sessionKey: key,
        state: "cita_awaiting_otp",
        slots: { citaDni: "12345678", citaTwofaId: "twofa-1" },
      })
    );
    const { client: minsaIdentityClient } = fakeMinsaIdentityClient({ verifyCodeResult: { status: "invalid" } });
    const { service } = makeService(sender, sessionStore, undefined, undefined, undefined, undefined, minsaIdentityClient);

    await service.process(makeEvent({ text: "000000" }));

    const stored = await sessionStore.load(key);
    expect(stored?.state).toBe("cita_awaiting_otp");
    expect(stored?.slots.citaOtpAttempts).toBe(1);
  });

  it("invalid, third occurrence (threat: unbounded lockout attempts): terminal cita_otp_locked, all cita slots cleared", async () => {
    const { sender } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    await sessionStore.save(
      fullSession({
        sessionKey: key,
        state: "cita_awaiting_otp",
        slots: { citaDni: "12345678", citaTwofaId: "twofa-1", citaOtpAttempts: 2 },
      })
    );
    const { client: minsaIdentityClient } = fakeMinsaIdentityClient({ verifyCodeResult: { status: "invalid" } });
    const { service } = makeService(sender, sessionStore, undefined, undefined, undefined, undefined, minsaIdentityClient);

    await service.process(makeEvent({ text: "000000" }));

    const stored = await sessionStore.load(key);
    expect(stored?.state).toBe("cita_otp_locked");
    expect(stored?.slots.citaDni).toBeUndefined();
    expect(stored?.slots.citaTwofaId).toBeUndefined();
    expect(stored?.slots.citaOtpAttempts).toBeUndefined();
  });

  // Phase 8: same removal as validate_user's own NotConfigured test above —
  // minsaIdentityClient is now REQUIRED, so this path is unreachable through
  // this service. See the comment at the end of the validate_user describe
  // block above for the full rationale.
});

// PR8 (Phase 8, final of Stage C1): full end-to-end integration coverage,
// driven the same way this codebase's "Integration (service)" layer always
// has been (design's Testing Strategy table) — real FSM, hand-written fakes
// for every driven port, zero module mocks, through the actual
// createConversationFlowService() composition (the same function worker.ts's
// startWorker() calls). worker.ts's own startWorker() is a self-invoking,
// unexported composition root with no test seam (mirrors every prior stage's
// own convention — see reniecLookupClient/quejasSubmissionClient's identical
// "unit-tested against fakes, real-endpoint validation pending" treatment);
// this is "as close as this codebase's existing integration-test conventions
// allow" to driving worker.ts's real composition, per this PR's scope note.
describe("createConversationFlowService — Phase 8 end-to-end integration (full Cita identity pipeline)", () => {
  it("main_menu -> agendar_cita -> DNI -> validate_user(valid) -> OTP -> verify_code(verified) -> cita_identity_confirmed with a bearer token in slots", async () => {
    const { sender, calls } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    const { client: minsaIdentityClient, calls: validateCalls, verifyCalls } = fakeMinsaIdentityClient({
      result: { status: "valid", twofaId: "twofa-e2e-1" },
      verifyCodeResult: { status: "verified", token: "bearer-e2e-token", tokenType: "Bearer", expiresIn: 3600 },
    });
    const { service } = makeService(
      sender,
      sessionStore,
      undefined,
      undefined,
      undefined,
      undefined,
      minsaIdentityClient
    );

    // Turn 1: citizen picks "Agendar cita" from the main menu.
    await service.process(makeEvent({ interactiveReplyId: "agendar_cita" }));
    expect((await sessionStore.load(key))?.state).toBe("cita_awaiting_dni");

    // Turn 2: citizen types their DNI -> validate_user(valid) -> cita_awaiting_otp.
    await service.process(makeEvent({ text: "12345678" }));
    const afterDni = await sessionStore.load(key);
    expect(afterDni?.state).toBe("cita_awaiting_otp");
    expect(afterDni?.slots.citaTwofaId).toBe("twofa-e2e-1");

    // Turn 3: citizen types the OTP -> verify_code(verified) -> cita_identity_confirmed.
    await service.process(makeEvent({ text: "654321" }));
    const final = await sessionStore.load(key);
    expect(final?.state).toBe("cita_identity_confirmed");
    expect(final?.slots.citaBearer).toBe("bearer-e2e-token");
    expect(final?.slots.citaDni).toBeUndefined();
    expect(final?.slots.citaTwofaId).toBeUndefined();

    expect(validateCalls).toEqual(["12345678"]);
    expect(verifyCalls).toEqual([{ twofaId: "twofa-e2e-1", code: "654321" }]);
    // 1 send at agendar_cita + 2 sends per DNI turn (validating + otp prompt)
    // + 2 sends per OTP turn (validating + confirmed) = 5 total.
    expect(calls).toHaveLength(5);
  });

  it("registration-wait retry ladder: not-registered -> schedule -> re-check -> still not-registered -> schedule again -> re-check -> still not-registered -> terminal rejected", async () => {
    const { sender } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    // Every validateUser call in this ladder returns not_valid — a single
    // fixed fake suffices because the FSM's own citaRegistrationChecks
    // counter, not the client, drives the ladder's termination.
    const { client: minsaIdentityClient, calls: validateCalls } = fakeMinsaIdentityClient({
      result: { status: "not_valid" },
    });
    const { scheduler, calls: scheduleCalls } = fakeScheduledCheckScheduler();
    const { service } = makeService(
      sender,
      sessionStore,
      undefined,
      undefined,
      undefined,
      scheduler,
      minsaIdentityClient
    );

    // Turn 1: agendar_cita -> cita_awaiting_dni.
    await service.process(makeEvent({ interactiveReplyId: "agendar_cita" }));

    // Turn 2: DNI -> validate_user #1 (not_valid) -> cita_registration_wait, check #1, wait scheduled.
    await service.process(makeEvent({ text: "99999999" }));
    let stored = await sessionStore.load(key);
    expect(stored?.state).toBe("cita_registration_wait");
    expect(stored?.slots.citaRegistrationChecks).toBe(1);
    expect(stored?.slots.citaWaitToken).toBe("registro_wait:1");
    expect(scheduleCalls).toHaveLength(1);

    // Re-check #1 fires: validate_user #2 (still not_valid) -> cita_registration_wait, check #2, wait scheduled again.
    await service.processScheduled(
      makeScheduledJob({
        sessionKey: key,
        to: FROM_MSISDN,
        expectedState: "cita_registration_wait",
        waitToken: "registro_wait:1",
      })
    );
    stored = await sessionStore.load(key);
    expect(stored?.state).toBe("cita_registration_wait");
    expect(stored?.slots.citaRegistrationChecks).toBe(2);
    expect(stored?.slots.citaWaitToken).toBe("registro_wait:2");
    expect(scheduleCalls).toHaveLength(2);

    // Re-check #2 fires: validate_user #3 (still not_valid) -> terminal cita_registration_rejected, no 3rd wait.
    await service.processScheduled(
      makeScheduledJob({
        sessionKey: key,
        to: FROM_MSISDN,
        expectedState: "cita_registration_wait",
        waitToken: "registro_wait:2",
      })
    );
    stored = await sessionStore.load(key);
    expect(stored?.state).toBe("cita_registration_rejected");
    expect(stored?.slots.citaDni).toBeUndefined();
    expect(stored?.slots.citaWaitToken).toBeUndefined();
    expect(stored?.slots.citaRegistrationChecks).toBeUndefined();

    expect(validateCalls).toEqual(["99999999", "99999999", "99999999"]);
    // Exactly 2 scheduled waits, never a 3rd — the structural bound this
    // ladder is proving end to end.
    expect(scheduleCalls).toHaveLength(2);
  });

  it("OTP lockout path end-to-end: 3 wrong codes in a row -> terminal cita_otp_locked", async () => {
    const { sender } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    const { client: minsaIdentityClient, verifyCalls } = fakeMinsaIdentityClient({
      result: { status: "valid", twofaId: "twofa-lockout-1" },
      verifyCodeResult: { status: "invalid" },
    });
    const { service } = makeService(
      sender,
      sessionStore,
      undefined,
      undefined,
      undefined,
      undefined,
      minsaIdentityClient
    );

    // Reach cita_awaiting_otp via the real DNI validation path (not a pre-seeded fixture).
    await service.process(makeEvent({ interactiveReplyId: "agendar_cita" }));
    await service.process(makeEvent({ text: "12345678" }));
    expect((await sessionStore.load(key))?.state).toBe("cita_awaiting_otp");

    // Wrong code #1: re-prompt, citaOtpAttempts = 1.
    await service.process(makeEvent({ text: "111111" }));
    let stored = await sessionStore.load(key);
    expect(stored?.state).toBe("cita_awaiting_otp");
    expect(stored?.slots.citaOtpAttempts).toBe(1);

    // Wrong code #2: re-prompt, citaOtpAttempts = 2.
    await service.process(makeEvent({ text: "222222" }));
    stored = await sessionStore.load(key);
    expect(stored?.state).toBe("cita_awaiting_otp");
    expect(stored?.slots.citaOtpAttempts).toBe(2);

    // Wrong code #3: terminal lockout, all cita slots cleared incl. citaBearer.
    await service.process(makeEvent({ text: "333333" }));
    stored = await sessionStore.load(key);
    expect(stored?.state).toBe("cita_otp_locked");
    expect(stored?.slots.citaDni).toBeUndefined();
    expect(stored?.slots.citaTwofaId).toBeUndefined();
    expect(stored?.slots.citaOtpAttempts).toBeUndefined();
    expect(stored?.slots.citaBearer).toBeUndefined();

    expect(verifyCalls).toEqual([
      { twofaId: "twofa-lockout-1", code: "111111" },
      { twofaId: "twofa-lockout-1", code: "222222" },
      { twofaId: "twofa-lockout-1", code: "333333" },
    ]);
  });

  // Task 8.3: a scheduler rejection during the DNI turn's schedule_check
  // effect must abort BEFORE persist — mirrors the existing "leaves the
  // prior stored session intact when a send effect fails" test above,
  // applied to the schedule executor instead of the send executor.
  it("a scheduler.schedule() rejection leaves the prior session persisted-unchanged (task 8.3)", async () => {
    const { sender } = fakeSender();
    const sessionStore = createMemorySessionStore({ logger: fakeLogger() });
    const key = msisdnDigest(FROM_MSISDN, SESSION_KEY_SECRET);
    await sessionStore.save(fullSession({ sessionKey: key, state: "cita_awaiting_dni" }));
    const priorSession = await sessionStore.load(key);
    const { client: minsaIdentityClient } = fakeMinsaIdentityClient({ result: { status: "not_valid" } });
    const { scheduler } = fakeScheduledCheckScheduler({
      failWith: new TransientFailureError("redis unreachable while scheduling"),
    });
    const { service } = makeService(
      sender,
      sessionStore,
      undefined,
      undefined,
      undefined,
      scheduler,
      minsaIdentityClient
    );

    await expect(service.process(makeEvent({ text: "12345678" }))).rejects.toBeInstanceOf(TransientFailureError);

    const afterFailure = await sessionStore.load(key);
    expect(afterFailure).toEqual(priorSession);
  });
});
